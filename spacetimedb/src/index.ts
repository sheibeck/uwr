import { schema, table, t, SenderError } from 'spacetimedb/server';

const Player = table(
  { name: 'player', public: true },
  {
    id: t.identity().primaryKey(),
    createdAt: t.timestamp(),
    lastSeenAt: t.timestamp(),
    displayName: t.string().optional(),
  }
);

const WorldState = table(
  { name: 'world_state', public: true },
  {
    id: t.u64().primaryKey(),
    startingLocationId: t.u64(),
  }
);

const Location = table(
  { name: 'location', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    description: t.string(),
    zone: t.string(),
    isSafe: t.bool(),
  }
);

const Character = table(
  {
    name: 'character',
    public: true,
    indexes: [
      { name: 'by_owner', algorithm: 'btree', columns: ['ownerId'] },
      { name: 'by_location', algorithm: 'btree', columns: ['locationId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    ownerId: t.identity(),
    name: t.string(),
    race: t.string(),
    className: t.string(),
    level: t.u64(),
    xp: t.u64(),
    locationId: t.u64(),
    hp: t.u64(),
    maxHp: t.u64(),
    mana: t.u64(),
    maxMana: t.u64(),
    createdAt: t.timestamp(),
  }
);

const EnemyTemplate = table(
  { name: 'enemy_template', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    level: t.u64(),
    maxHp: t.u64(),
    xpReward: t.u64(),
  }
);

const Combat = table(
  {
    name: 'combat',
    public: true,
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    enemyId: t.u64(),
    enemyName: t.string(),
    enemyLevel: t.u64(),
    enemyHp: t.u64(),
    enemyMaxHp: t.u64(),
    status: t.string(),
    startedAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

const Command = table(
  {
    name: 'command',
    public: true,
    indexes: [
      { name: 'by_owner', algorithm: 'btree', columns: ['ownerId'] },
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    ownerId: t.identity(),
    characterId: t.u64(),
    text: t.string(),
    status: t.string(),
    createdAt: t.timestamp(),
  }
);

const EventLog = table(
  {
    name: 'event_log',
    public: true,
    indexes: [{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    message: t.string(),
    kind: t.string(),
    createdAt: t.timestamp(),
  }
);

export const spacetimedb = schema(
  Player,
  WorldState,
  Location,
  Character,
  EnemyTemplate,
  Combat,
  Command,
  EventLog
);

function tableHasRows<T>(iter: IterableIterator<T>): boolean {
  for (const _row of iter) return true;
  return false;
}

function requireCharacterOwnedBy(ctx: any, characterId: bigint) {
  const character = ctx.db.character.id.find(characterId);
  if (!character) throw new SenderError('Character not found');
  if (character.ownerId.toHexString() !== ctx.sender.toHexString()) {
    throw new SenderError('Not your character');
  }
  return character;
}

function appendEvent(ctx: any, characterId: bigint, kind: string, message: string) {
  ctx.db.eventLog.insert({
    id: 0n,
    characterId,
    kind,
    message,
    createdAt: ctx.timestamp,
  });
}

spacetimedb.init((ctx) => {
  if (!tableHasRows(ctx.db.location.iter())) {
    const town = ctx.db.location.insert({
      id: 0n,
      name: 'Hollowmere',
      description: 'A misty river town with lantern-lit docks and a quiet market square.',
      zone: 'Starter',
      isSafe: true,
    });
    ctx.db.location.insert({
      id: 0n,
      name: 'Ashen Road',
      description: 'A cracked highway flanked by dead trees and drifting embers.',
      zone: 'Starter',
      isSafe: false,
    });
    ctx.db.worldState.insert({ id: 1n, startingLocationId: town.id });
  }

  if (!tableHasRows(ctx.db.enemyTemplate.iter())) {
    ctx.db.enemyTemplate.insert({ id: 0n, name: 'Bog Rat', level: 1n, maxHp: 18n, xpReward: 12n });
    ctx.db.enemyTemplate.insert({ id: 0n, name: 'Ember Wisp', level: 2n, maxHp: 26n, xpReward: 20n });
  }
});

spacetimedb.clientConnected((ctx) => {
  const existing = ctx.db.player.id.find(ctx.sender);
  if (!existing) {
    ctx.db.player.insert({
      id: ctx.sender,
      createdAt: ctx.timestamp,
      lastSeenAt: ctx.timestamp,
      displayName: undefined,
    });
  } else {
    ctx.db.player.id.update({ ...existing, lastSeenAt: ctx.timestamp });
  }
});

spacetimedb.clientDisconnected((_ctx) => {
  // Reserved for presence cleanup
});

spacetimedb.reducer('set_display_name', { name: t.string() }, (ctx, { name }) => {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player) throw new SenderError('Player not found');
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new SenderError('Display name too short');
  ctx.db.player.id.update({ ...player, displayName: trimmed, lastSeenAt: ctx.timestamp });
});

spacetimedb.reducer(
  'create_character',
  { name: t.string(), race: t.string(), className: t.string() },
  (ctx, { name, race, className }) => {
    const trimmed = name.trim();
    if (trimmed.length < 2) throw new SenderError('Name too short');
    for (const row of ctx.db.character.by_owner.filter(ctx.sender)) {
      if (row.name.toLowerCase() === trimmed.toLowerCase()) {
        throw new SenderError('Character name already exists');
      }
    }

    const world = ctx.db.worldState.id.find(1n);
    if (!world) throw new SenderError('World not initialized');

    const character = ctx.db.character.insert({
      id: 0n,
      ownerId: ctx.sender,
      name: trimmed,
      race: race.trim(),
      className: className.trim(),
      level: 1n,
      xp: 0n,
      locationId: world.startingLocationId,
      hp: 30n,
      maxHp: 30n,
      mana: 10n,
      maxMana: 10n,
      createdAt: ctx.timestamp,
    });

    appendEvent(ctx, character.id, 'system', `${character.name} enters the world.`);
  }
);

spacetimedb.reducer('move_character', { characterId: t.u64(), locationId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const location = ctx.db.location.id.find(args.locationId);
  if (!location) throw new SenderError('Location not found');
  if (character.locationId === location.id) return;

  ctx.db.character.id.update({ ...character, locationId: location.id });
  appendEvent(ctx, character.id, 'move', `You travel to ${location.name}. ${location.description}`);
});

spacetimedb.reducer('submit_command', { characterId: t.u64(), text: t.string() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const trimmed = args.text.trim();
  if (!trimmed) throw new SenderError('Command is empty');

  ctx.db.command.insert({
    id: 0n,
    ownerId: ctx.sender,
    characterId: character.id,
    text: trimmed,
    status: 'pending',
    createdAt: ctx.timestamp,
  });

  appendEvent(ctx, character.id, 'command', `> ${trimmed}`);
});

spacetimedb.reducer('start_combat', { characterId: t.u64(), enemyId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const enemy = ctx.db.enemyTemplate.id.find(args.enemyId);
  if (!enemy) throw new SenderError('Enemy not found');

  for (const row of ctx.db.combat.by_character.filter(character.id)) {
    if (row.status === 'active') throw new SenderError('Combat already active');
  }

  ctx.db.combat.insert({
    id: 0n,
    characterId: character.id,
    enemyId: enemy.id,
    enemyName: enemy.name,
    enemyLevel: enemy.level,
    enemyHp: enemy.maxHp,
    enemyMaxHp: enemy.maxHp,
    status: 'active',
    startedAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });

  appendEvent(ctx, character.id, 'combat', `A ${enemy.name} approaches!`);
});

spacetimedb.reducer('attack', { combatId: t.u64(), damage: t.u64() }, (ctx, args) => {
  const combat = ctx.db.combat.id.find(args.combatId);
  if (!combat) throw new SenderError('Combat not found');
  const character = requireCharacterOwnedBy(ctx, combat.characterId);

  if (combat.status !== 'active') throw new SenderError('Combat is not active');
  const newHp = combat.enemyHp > args.damage ? combat.enemyHp - args.damage : 0n;
  ctx.db.combat.id.update({ ...combat, enemyHp: newHp, updatedAt: ctx.timestamp });

  appendEvent(ctx, character.id, 'combat', `You strike for ${args.damage} damage.`);

  if (newHp === 0n) {
    const enemy = ctx.db.enemyTemplate.id.find(combat.enemyId);
    const reward = enemy ? enemy.xpReward : 0n;

    const totalXp = character.xp + reward;
    const nextLevelXp = character.level * 100n;
    let newLevel = character.level;
    let newMaxHp = character.maxHp;
    let newMaxMana = character.maxMana;
    let newHp = character.hp;
    let newMana = character.mana;
    if (totalXp >= nextLevelXp) {
      newLevel = character.level + 1n;
      newMaxHp = character.maxHp + 5n;
      newMaxMana = character.maxMana + 3n;
      newHp = newMaxHp;
      newMana = newMaxMana;
      appendEvent(ctx, character.id, 'system', `You reached level ${newLevel}!`);
    }

    ctx.db.character.id.update({
      ...character,
      xp: totalXp,
      level: newLevel,
      maxHp: newMaxHp,
      maxMana: newMaxMana,
      hp: newHp,
      mana: newMana,
    });

    ctx.db.combat.id.update({ ...combat, status: 'won', enemyHp: 0n, updatedAt: ctx.timestamp });
    appendEvent(ctx, character.id, 'combat', `You defeated ${combat.enemyName}! +${reward} XP.`);
  }
});

spacetimedb.reducer('end_combat', { combatId: t.u64(), reason: t.string() }, (ctx, args) => {
  const combat = ctx.db.combat.id.find(args.combatId);
  if (!combat) throw new SenderError('Combat not found');
  const character = requireCharacterOwnedBy(ctx, combat.characterId);

  if (combat.status !== 'active') return;
  ctx.db.combat.id.update({ ...combat, status: 'ended', updatedAt: ctx.timestamp });
  appendEvent(ctx, character.id, 'combat', `Combat ended: ${args.reason}`);
});
