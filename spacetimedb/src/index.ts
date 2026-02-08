import { schema, table, t, SenderError } from 'spacetimedb/server';

const Player = table(
  { name: 'player', public: true },
  {
    id: t.identity().primaryKey(),
    createdAt: t.timestamp(),
    lastSeenAt: t.timestamp(),
    displayName: t.string().optional(),
    activeCharacterId: t.u64().optional(),
    userId: t.u64().optional(),
    sessionStartedAt: t.timestamp().optional(),
  }
);

const User = table(
  {
    name: 'user',
    public: true,
    indexes: [{ name: 'by_email', algorithm: 'btree', columns: ['email'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    email: t.string(),
    createdAt: t.timestamp(),
  }
);

const FriendRequest = table(
  {
    name: 'friend_request',
    indexes: [
      { name: 'by_from', algorithm: 'btree', columns: ['fromUserId'] },
      { name: 'by_to', algorithm: 'btree', columns: ['toUserId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    fromUserId: t.u64(),
    toUserId: t.u64(),
    createdAt: t.timestamp(),
  }
);

const Friend = table(
  {
    name: 'friend',
    indexes: [{ name: 'by_user', algorithm: 'btree', columns: ['userId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    userId: t.u64(),
    friendUserId: t.u64(),
    createdAt: t.timestamp(),
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
      { name: 'by_owner_user', algorithm: 'btree', columns: ['ownerUserId'] },
      { name: 'by_location', algorithm: 'btree', columns: ['locationId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    ownerUserId: t.u64(),
    name: t.string(),
    race: t.string(),
    className: t.string(),
    level: t.u64(),
    xp: t.u64(),
    locationId: t.u64(),
    groupId: t.u64().optional(),
    hp: t.u64(),
    maxHp: t.u64(),
    mana: t.u64(),
    maxMana: t.u64(),
    createdAt: t.timestamp(),
  }
);

const Group = table(
  { name: 'group', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    leaderCharacterId: t.u64(),
    createdAt: t.timestamp(),
  }
);

const GroupMember = table(
  {
    name: 'group_member',
    indexes: [
      { name: 'by_owner_user', algorithm: 'btree', columns: ['ownerUserId'] },
      { name: 'by_group', algorithm: 'btree', columns: ['groupId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    groupId: t.u64(),
    characterId: t.u64(),
    ownerUserId: t.u64(),
    role: t.string(),
    followLeader: t.bool(),
    joinedAt: t.timestamp(),
  }
);

const GroupInvite = table(
  {
    name: 'group_invite',
    indexes: [
      { name: 'by_to_character', algorithm: 'btree', columns: ['toCharacterId'] },
      { name: 'by_group', algorithm: 'btree', columns: ['groupId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    groupId: t.u64(),
    fromCharacterId: t.u64(),
    toCharacterId: t.u64(),
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
      { name: 'by_owner_user', algorithm: 'btree', columns: ['ownerUserId'] },
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    ownerUserId: t.u64(),
    characterId: t.u64(),
    text: t.string(),
    status: t.string(),
    createdAt: t.timestamp(),
  }
);

const EventWorld = table(
  {
    name: 'event_world',
    public: true,
  },
  {
    id: t.u64().primaryKey().autoInc(),
    message: t.string(),
    kind: t.string(),
    createdAt: t.timestamp(),
  }
);

const EventLocation = table(
  {
    name: 'event_location',
    indexes: [{ name: 'by_location', algorithm: 'btree', columns: ['locationId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    locationId: t.u64(),
    message: t.string(),
    kind: t.string(),
    excludeCharacterId: t.u64().optional(),
    createdAt: t.timestamp(),
  }
);

const EventPrivate = table(
  {
    name: 'event_private',
    indexes: [
      { name: 'by_owner_user', algorithm: 'btree', columns: ['ownerUserId'] },
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    ownerUserId: t.u64(),
    characterId: t.u64(),
    message: t.string(),
    kind: t.string(),
    createdAt: t.timestamp(),
  }
);

const EventGroup = table(
  {
    name: 'event_group',
    indexes: [
      { name: 'by_group', algorithm: 'btree', columns: ['groupId'] },
      { name: 'by_character', algorithm: 'btree', columns: ['characterId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    groupId: t.u64(),
    characterId: t.u64(),
    message: t.string(),
    kind: t.string(),
    createdAt: t.timestamp(),
  }
);

export const spacetimedb = schema(
  Player,
  User,
  FriendRequest,
  Friend,
  WorldState,
  Location,
  Character,
  Group,
  GroupMember,
  GroupInvite,
  EnemyTemplate,
  Combat,
  Command,
  EventWorld,
  EventLocation,
  EventPrivate,
  EventGroup
);

function tableHasRows<T>(iter: IterableIterator<T>): boolean {
  for (const _row of iter) return true;
  return false;
}

function requirePlayerUserId(ctx: any): bigint {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player || player.userId == null) throw new SenderError('Login required');
  return player.userId;
}

function requireCharacterOwnedBy(ctx: any, characterId: bigint) {
  const character = ctx.db.character.id.find(characterId);
  if (!character) throw new SenderError('Character not found');
  const userId = requirePlayerUserId(ctx);
  if (character.ownerUserId !== userId) {
    throw new SenderError('Not your character');
  }
  return character;
}

function appendWorldEvent(ctx: any, kind: string, message: string) {
  ctx.db.eventWorld.insert({
    id: 0n,
    kind,
    message,
    createdAt: ctx.timestamp,
  });
}

function appendLocationEvent(
  ctx: any,
  locationId: bigint,
  kind: string,
  message: string,
  excludeCharacterId?: bigint
) {
  ctx.db.eventLocation.insert({
    id: 0n,
    locationId,
    kind,
    message,
    excludeCharacterId,
    createdAt: ctx.timestamp,
  });
}

function appendPrivateEvent(
  ctx: any,
  characterId: bigint,
  ownerUserId: bigint,
  kind: string,
  message: string
) {
  ctx.db.eventPrivate.insert({
    id: 0n,
    ownerUserId,
    characterId,
    kind,
    message,
    createdAt: ctx.timestamp,
  });
}

function appendGroupEvent(
  ctx: any,
  groupId: bigint,
  characterId: bigint,
  kind: string,
  message: string
) {
  ctx.db.eventGroup.insert({
    id: 0n,
    groupId,
    characterId,
    kind,
    message,
    createdAt: ctx.timestamp,
  });
}

function friendUserIds(ctx: any, userId: bigint): bigint[] {
  const ids: bigint[] = [];
  for (const row of ctx.db.friend.by_user.filter(userId)) {
    ids.push(row.friendUserId);
  }
  return ids;
}

function findCharacterByName(ctx: any, name: string) {
  let found: typeof Character.rowType | null = null;
  for (const row of ctx.db.character.iter()) {
    if (row.name.toLowerCase() === name.toLowerCase()) {
      if (found) throw new SenderError('Multiple characters share that name');
      found = row;
    }
  }
  return found;
}

spacetimedb.view(
  { name: 'my_private_events', public: true },
  t.array(EventPrivate.rowType),
  (ctx) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || player.userId == null) return [];
    return [...ctx.db.eventPrivate.by_owner_user.filter(player.userId)];
  }
);

spacetimedb.view({ name: 'my_player', public: true }, t.array(Player.rowType), (ctx) => {
  const player = ctx.db.player.id.find(ctx.sender);
  return player ? [player] : [];
});

spacetimedb.view(
  { name: 'my_friend_requests', public: true },
  t.array(FriendRequest.rowType),
  (ctx) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || player.userId == null) return [];
    const incoming = [...ctx.db.friendRequest.by_to.filter(player.userId)];
    const outgoing = [...ctx.db.friendRequest.by_from.filter(player.userId)];
    return [...incoming, ...outgoing];
  }
);

spacetimedb.view({ name: 'my_friends', public: true }, t.array(Friend.rowType), (ctx) => {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player || player.userId == null) return [];
  return [...ctx.db.friend.by_user.filter(player.userId)];
});

spacetimedb.view(
  { name: 'my_group_invites', public: true },
  t.array(GroupInvite.rowType),
  (ctx) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || player.userId == null) return [];
    const invites: typeof GroupInvite.rowType[] = [];
    for (const character of ctx.db.character.by_owner_user.filter(player.userId)) {
      for (const invite of ctx.db.groupInvite.by_to_character.filter(character.id)) {
        invites.push(invite);
      }
    }
    return invites;
  }
);

spacetimedb.view(
  { name: 'my_group_events', public: true },
  t.array(EventGroup.rowType),
  (ctx) => {
    const events: typeof EventGroup.rowType[] = [];
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || player.userId == null) return events;
    for (const member of ctx.db.groupMember.by_owner_user.filter(player.userId)) {
      for (const event of ctx.db.eventGroup.by_group.filter(member.groupId)) {
        events.push(event);
      }
    }
    return events;
  }
);

spacetimedb.view(
  { name: 'my_group_members', public: true },
  t.array(GroupMember.rowType),
  (ctx) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player || player.userId == null) return [];
    return [...ctx.db.groupMember.by_owner_user.filter(player.userId)];
  }
);

spacetimedb.view(
  { name: 'my_location_events', public: true },
  t.array(EventLocation.rowType),
  (ctx) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player?.activeCharacterId) return [];
    const character = ctx.db.character.id.find(player.activeCharacterId);
    if (!character) return [];
    const events = [...ctx.db.eventLocation.by_location.filter(character.locationId)];
    return events.filter(
      (event) =>
        !event.excludeCharacterId || event.excludeCharacterId !== character.id
    );
  }
);

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
      activeCharacterId: undefined,
      userId: undefined,
    });
  } else {
    ctx.db.player.id.update({ ...existing, lastSeenAt: ctx.timestamp });
  }
});

spacetimedb.clientDisconnected((_ctx) => {
  // Presence events are written here so others see logout.
  // Note: _ctx.sender is still available in disconnect.
  const ctx = _ctx as any;
  const player = ctx.db.player.id.find(ctx.sender);
  if (player) {
    ctx.db.player.id.update({ ...player, lastSeenAt: ctx.timestamp });
  }

  if (player && player.userId != null && player.activeCharacterId != null) {
    const character = ctx.db.character.id.find(player.activeCharacterId);
    if (character) {
      const friends = friendUserIds(ctx, player.userId);
      for (const friendId of friends) {
        appendPrivateEvent(
          ctx,
          character.id,
          friendId,
          'presence',
          `${character.name} went offline.`
        );
      }
    }
  }
});

spacetimedb.reducer('set_display_name', { name: t.string() }, (ctx, { name }) => {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player) throw new SenderError('Player not found');
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new SenderError('Display name too short');
  ctx.db.player.id.update({ ...player, displayName: trimmed, lastSeenAt: ctx.timestamp });
});

spacetimedb.reducer('send_friend_request', { email: t.string() }, (ctx, { email }) => {
  const userId = requirePlayerUserId(ctx);
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) throw new SenderError('Invalid email');
  const target = [...ctx.db.user.by_email.filter(trimmed)][0];
  if (!target) throw new SenderError('User not found');
  if (target.id === userId) throw new SenderError('Cannot friend yourself');

  for (const row of ctx.db.friend.by_user.filter(userId)) {
    if (row.friendUserId === target.id) return;
  }
  for (const row of ctx.db.friendRequest.by_from.filter(userId)) {
    if (row.toUserId === target.id) return;
  }

  ctx.db.friendRequest.insert({
    id: 0n,
    fromUserId: userId,
    toUserId: target.id,
    createdAt: ctx.timestamp,
  });
});

spacetimedb.reducer(
  'send_friend_request_to_character',
  { characterId: t.u64(), targetName: t.string() },
  (ctx, args) => {
    const requester = requireCharacterOwnedBy(ctx, args.characterId);
    const targetName = args.targetName.trim();
    if (!targetName) throw new SenderError('Target required');
    const target = findCharacterByName(ctx, targetName);
    if (!target) throw new SenderError('Target not found');
    if (target.ownerUserId === requester.ownerUserId) {
      throw new SenderError('Cannot friend yourself');
    }

    for (const row of ctx.db.friend.by_user.filter(requester.ownerUserId)) {
      if (row.friendUserId === target.ownerUserId) {
        appendPrivateEvent(
          ctx,
          requester.id,
          requester.ownerUserId,
          'friend',
          `You are already friends with ${target.name}.`
        );
        return;
      }
    }
    for (const row of ctx.db.friendRequest.by_from.filter(requester.ownerUserId)) {
      if (row.toUserId === target.ownerUserId) {
        appendPrivateEvent(
          ctx,
          requester.id,
          requester.ownerUserId,
          'friend',
          `You already sent a friend request to ${target.name}.`
        );
        return;
      }
    }

    ctx.db.friendRequest.insert({
      id: 0n,
      fromUserId: requester.ownerUserId,
      toUserId: target.ownerUserId,
      createdAt: ctx.timestamp,
    });

    appendPrivateEvent(
      ctx,
      requester.id,
      requester.ownerUserId,
      'friend',
      `You sent a friend request to ${target.name}.`
    );
    appendPrivateEvent(
      ctx,
      target.id,
      target.ownerUserId,
      'friend',
      `${requester.name} sent you a friend request.`
    );
  }
);

spacetimedb.reducer('accept_friend_request', { fromUserId: t.u64() }, (ctx, { fromUserId }) => {
  const userId = requirePlayerUserId(ctx);
  let requestId: bigint | null = null;
  for (const row of ctx.db.friendRequest.by_to.filter(userId)) {
    if (row.fromUserId === fromUserId) {
      requestId = row.id;
      break;
    }
  }
  if (requestId == null) throw new SenderError('Friend request not found');

  ctx.db.friendRequest.id.delete(requestId);

  ctx.db.friend.insert({
    id: 0n,
    userId,
    friendUserId: fromUserId,
    createdAt: ctx.timestamp,
  });
  ctx.db.friend.insert({
    id: 0n,
    userId: fromUserId,
    friendUserId: userId,
    createdAt: ctx.timestamp,
  });
});

spacetimedb.reducer('reject_friend_request', { fromUserId: t.u64() }, (ctx, { fromUserId }) => {
  const userId = requirePlayerUserId(ctx);
  for (const row of ctx.db.friendRequest.by_to.filter(userId)) {
    if (row.fromUserId === fromUserId) {
      ctx.db.friendRequest.id.delete(row.id);
      return;
    }
  }
});

spacetimedb.reducer('remove_friend', { friendUserId: t.u64() }, (ctx, { friendUserId }) => {
  const userId = requirePlayerUserId(ctx);
  for (const row of ctx.db.friend.by_user.filter(userId)) {
    if (row.friendUserId === friendUserId) {
      ctx.db.friend.id.delete(row.id);
      break;
    }
  }
  for (const row of ctx.db.friend.by_user.filter(friendUserId)) {
    if (row.friendUserId === userId) {
      ctx.db.friend.id.delete(row.id);
      break;
    }
  }
});

spacetimedb.reducer('login_email', { email: t.string() }, (ctx, { email }) => {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player) throw new SenderError('Player not found');
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) throw new SenderError('Invalid email');

  const existing = [...ctx.db.user.by_email.filter(trimmed)][0];
  const user =
    existing ??
    ctx.db.user.insert({
      id: 0n,
      email: trimmed,
      createdAt: ctx.timestamp,
    });

  ctx.db.player.id.update({
    ...player,
    userId: user.id,
    sessionStartedAt: ctx.timestamp,
    lastSeenAt: ctx.timestamp,
  });
});

spacetimedb.reducer('logout', (ctx) => {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player) return;
  if (player.userId != null && player.activeCharacterId != null) {
    const character = ctx.db.character.id.find(player.activeCharacterId);
    if (character) {
      const friends = friendUserIds(ctx, player.userId);
      for (const friendId of friends) {
        appendPrivateEvent(
          ctx,
          character.id,
          friendId,
          'presence',
          `${character.name} went offline.`
        );
      }
    }
  }
  ctx.db.player.id.update({
    ...player,
    userId: undefined,
    activeCharacterId: undefined,
    sessionStartedAt: undefined,
    lastSeenAt: ctx.timestamp,
  });
});

spacetimedb.reducer('set_active_character', { characterId: t.u64() }, (ctx, { characterId }) => {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player) throw new SenderError('Player not found');
  const character = requireCharacterOwnedBy(ctx, characterId);
  const previousActiveId = player.activeCharacterId;
  if (previousActiveId && previousActiveId !== character.id) {
    const previous = ctx.db.character.id.find(previousActiveId);
    if (previous) {
      const userId = requirePlayerUserId(ctx);
      const friends = friendUserIds(ctx, userId);
      for (const friendId of friends) {
        appendPrivateEvent(
          ctx,
          previous.id,
          friendId,
          'presence',
          `${previous.name} went offline.`
        );
      }
    }
  }

  ctx.db.player.id.update({ ...player, activeCharacterId: character.id });

  const userId = requirePlayerUserId(ctx);
  appendPrivateEvent(ctx, character.id, userId, 'presence', 'You are online.');
  const friends = friendUserIds(ctx, userId);
  for (const friendId of friends) {
    appendPrivateEvent(
      ctx,
      character.id,
      friendId,
      'presence',
      `${character.name} is online.`
    );
  }

  appendLocationEvent(
    ctx,
    character.locationId,
    'system',
    `${character.name} steps into the area.`,
    character.id
  );
});

spacetimedb.reducer(
  'create_character',
  { name: t.string(), race: t.string(), className: t.string() },
  (ctx, { name, race, className }) => {
    const trimmed = name.trim();
    if (trimmed.length < 2) throw new SenderError('Name too short');
    const userId = requirePlayerUserId(ctx);
    for (const row of ctx.db.character.iter()) {
      if (row.name.toLowerCase() === trimmed.toLowerCase()) {
        throw new SenderError('Character name already exists');
      }
    }

    const world = ctx.db.worldState.id.find(1n);
    if (!world) throw new SenderError('World not initialized');

    const character = ctx.db.character.insert({
      id: 0n,
      ownerUserId: userId,
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

    appendPrivateEvent(ctx, character.id, userId, 'system', `${character.name} enters the world.`);
  }
);

spacetimedb.reducer('move_character', { characterId: t.u64(), locationId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const location = ctx.db.location.id.find(args.locationId);
  if (!location) throw new SenderError('Location not found');
  if (character.locationId === location.id) return;

  const originLocationId = character.locationId;
  const userId = requirePlayerUserId(ctx);

  const moveOne = (row: typeof Character.rowType) => {
    ctx.db.character.id.update({ ...row, locationId: location.id });
    appendPrivateEvent(
      ctx,
      row.id,
      row.ownerUserId,
      'move',
      `You travel to ${location.name}. ${location.description}`
    );
    appendLocationEvent(ctx, originLocationId, 'move', `${row.name} departs.`, row.id);
    appendLocationEvent(ctx, location.id, 'move', `${row.name} arrives.`, row.id);
  };

  if (character.groupId) {
    const group = ctx.db.group.id.find(character.groupId);
    if (group && group.leaderCharacterId === character.id) {
      for (const member of ctx.db.groupMember.by_group.filter(group.id)) {
        if (!member.followLeader) continue;
        const memberCharacter = ctx.db.character.id.find(member.characterId);
        if (
          memberCharacter &&
          memberCharacter.locationId === originLocationId &&
          memberCharacter.locationId !== location.id
        ) {
          moveOne(memberCharacter);
        }
      }
      return;
    }
  }

  moveOne(character);
});

spacetimedb.reducer('submit_command', { characterId: t.u64(), text: t.string() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const trimmed = args.text.trim();
  if (!trimmed) throw new SenderError('Command is empty');

  if (trimmed.toLowerCase() === '/look' || trimmed.toLowerCase() === 'look') {
    const location = ctx.db.location.id.find(character.locationId);
    if (location) {
      appendPrivateEvent(
        ctx,
        character.id,
        requirePlayerUserId(ctx),
        'look',
        `${location.name}: ${location.description}`
      );
    }
    return;
  }

  ctx.db.command.insert({
    id: 0n,
    ownerUserId: requirePlayerUserId(ctx),
    characterId: character.id,
    text: trimmed,
    status: 'pending',
    createdAt: ctx.timestamp,
  });

  appendPrivateEvent(ctx, character.id, requirePlayerUserId(ctx), 'command', `> ${trimmed}`);
});

spacetimedb.reducer('say', { characterId: t.u64(), message: t.string() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  const trimmed = args.message.trim();
  if (!trimmed) throw new SenderError('Message is empty');

  appendLocationEvent(
    ctx,
    character.locationId,
    'say',
    `${character.name} says, "${trimmed}"`
  );
});

spacetimedb.reducer(
  'whisper',
  { characterId: t.u64(), targetName: t.string(), message: t.string() },
  (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const targetName = args.targetName.trim();
    const message = args.message.trim();
    if (!targetName) throw new SenderError('Target required');
    if (!message) throw new SenderError('Message is empty');

    let target: typeof Character.rowType | null = null;
    for (const row of ctx.db.character.iter()) {
      if (row.name.toLowerCase() === targetName.toLowerCase()) {
        if (target) throw new SenderError('Multiple characters share that name');
        target = row;
      }
    }
    if (!target) throw new SenderError('Target not found');

    const senderUserId = requirePlayerUserId(ctx);
    appendPrivateEvent(
      ctx,
      character.id,
      senderUserId,
      'whisper',
      `You whisper to ${target.name}: "${message}"`
    );
    appendPrivateEvent(
      ctx,
      target.id,
      target.ownerUserId,
      'whisper',
      `${character.name} whispers: "${message}"`
    );
  }
);

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

  appendPrivateEvent(ctx, character.id, requirePlayerUserId(ctx), 'combat', `A ${enemy.name} approaches!`);

  if (character.groupId) {
    appendGroupEvent(
      ctx,
      character.groupId,
      character.id,
      'combat',
      `${character.name} engages ${enemy.name}.`
    );
  }
});

spacetimedb.reducer('create_group', { characterId: t.u64(), name: t.string() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  if (character.groupId) throw new SenderError('Character already in a group');
  const trimmed = args.name.trim();
  if (trimmed.length < 2) throw new SenderError('Group name too short');

  const group = ctx.db.group.insert({
    id: 0n,
    name: trimmed,
    leaderCharacterId: character.id,
    createdAt: ctx.timestamp,
  });

  ctx.db.groupMember.insert({
    id: 0n,
    groupId: group.id,
    characterId: character.id,
    ownerUserId: requirePlayerUserId(ctx),
    role: 'leader',
    followLeader: true,
    joinedAt: ctx.timestamp,
  });

  ctx.db.character.id.update({ ...character, groupId: group.id });
  appendGroupEvent(ctx, group.id, character.id, 'group', `${character.name} formed a group.`);
});

spacetimedb.reducer('join_group', { characterId: t.u64(), groupId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  if (character.groupId) throw new SenderError('Character already in a group');
  const group = ctx.db.group.id.find(args.groupId);
  if (!group) throw new SenderError('Group not found');

  ctx.db.groupMember.insert({
    id: 0n,
    groupId: group.id,
    characterId: character.id,
    ownerUserId: requirePlayerUserId(ctx),
    role: 'member',
    followLeader: true,
    joinedAt: ctx.timestamp,
  });

  ctx.db.character.id.update({ ...character, groupId: group.id });
  appendGroupEvent(ctx, group.id, character.id, 'group', `${character.name} joined the group.`);
});

spacetimedb.reducer('leave_group', { characterId: t.u64() }, (ctx, args) => {
  const character = requireCharacterOwnedBy(ctx, args.characterId);
  if (!character.groupId) throw new SenderError('Character not in a group');
  const groupId = character.groupId;
  const group = ctx.db.group.id.find(groupId);

  for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
    if (member.characterId === character.id) {
      ctx.db.groupMember.id.delete(member.id);
      break;
    }
  }

  ctx.db.character.id.update({ ...character, groupId: undefined });
  appendGroupEvent(ctx, groupId, character.id, 'group', `${character.name} left the group.`);

  let newLeaderMember: typeof GroupMember.rowType | null = null;
  for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
    if (!newLeaderMember) newLeaderMember = member;
  }

  if (!newLeaderMember) {
    for (const invite of ctx.db.groupInvite.by_group.filter(groupId)) {
      ctx.db.groupInvite.id.delete(invite.id);
    }
    ctx.db.group.id.delete(groupId);
    return;
  }

  if (group && group.leaderCharacterId === character.id) {
    const newLeaderCharacter = ctx.db.character.id.find(newLeaderMember.characterId);
    if (newLeaderCharacter) {
      ctx.db.group.id.update({ ...group, leaderCharacterId: newLeaderCharacter.id });
      ctx.db.groupMember.id.update({ ...newLeaderMember, role: 'leader' });
      appendGroupEvent(
        ctx,
        groupId,
        newLeaderCharacter.id,
        'group',
        `${newLeaderCharacter.name} is now the group leader.`
      );
    }
  }
});

spacetimedb.reducer(
  'set_follow_leader',
  { characterId: t.u64(), follow: t.bool() },
  (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (!character.groupId) throw new SenderError('Not in a group');
    for (const member of ctx.db.groupMember.by_group.filter(character.groupId)) {
      if (member.characterId === character.id) {
        ctx.db.groupMember.id.update({ ...member, followLeader: args.follow });
        return;
      }
    }
    throw new SenderError('Group membership not found');
  }
);

spacetimedb.reducer(
  'promote_group_leader',
  { characterId: t.u64(), targetName: t.string() },
  (ctx, args) => {
    const leader = requireCharacterOwnedBy(ctx, args.characterId);
    if (!leader.groupId) throw new SenderError('Not in a group');
    const group = ctx.db.group.id.find(leader.groupId);
    if (!group) throw new SenderError('Group not found');
    if (group.leaderCharacterId !== leader.id) throw new SenderError('Only leader can promote');

    const target = findCharacterByName(ctx, args.targetName.trim());
    if (!target) throw new SenderError('Target not found');
    if (target.groupId !== leader.groupId) throw new SenderError('Target not in your group');

    ctx.db.group.id.update({ ...group, leaderCharacterId: target.id });

    for (const member of ctx.db.groupMember.by_group.filter(group.id)) {
      if (member.characterId === leader.id) {
        ctx.db.groupMember.id.update({ ...member, role: 'member' });
      } else if (member.characterId === target.id) {
        ctx.db.groupMember.id.update({ ...member, role: 'leader' });
      }
    }

    appendGroupEvent(ctx, group.id, target.id, 'group', `${target.name} is now the group leader.`);
  }
);

spacetimedb.reducer(
  'kick_group_member',
  { characterId: t.u64(), targetName: t.string() },
  (ctx, args) => {
    const leader = requireCharacterOwnedBy(ctx, args.characterId);
    if (!leader.groupId) throw new SenderError('Not in a group');
    const group = ctx.db.group.id.find(leader.groupId);
    if (!group) throw new SenderError('Group not found');
    if (group.leaderCharacterId !== leader.id) throw new SenderError('Only leader can kick');

    const target = findCharacterByName(ctx, args.targetName.trim());
    if (!target) throw new SenderError('Target not found');
    if (target.groupId !== leader.groupId) throw new SenderError('Target not in your group');
    if (target.id === leader.id) throw new SenderError('Leader cannot kick themselves');

    for (const member of ctx.db.groupMember.by_group.filter(group.id)) {
      if (member.characterId === target.id) {
        ctx.db.groupMember.id.delete(member.id);
        break;
      }
    }

    ctx.db.character.id.update({ ...target, groupId: undefined });
    appendGroupEvent(ctx, group.id, target.id, 'group', `${target.name} was removed from the group.`);
    appendPrivateEvent(
      ctx,
      target.id,
      target.ownerUserId,
      'group',
      `You were removed from ${group.name}.`
    );

    let remaining = 0;
    for (const _row of ctx.db.groupMember.by_group.filter(group.id)) {
      remaining += 1;
      break;
    }
    if (remaining === 0) {
      for (const invite of ctx.db.groupInvite.by_group.filter(group.id)) {
        ctx.db.groupInvite.id.delete(invite.id);
      }
      ctx.db.group.id.delete(group.id);
    }
  }
);

spacetimedb.reducer(
  'invite_to_group',
  { characterId: t.u64(), targetName: t.string() },
  (ctx, args) => {
    const inviter = requireCharacterOwnedBy(ctx, args.characterId);
    const targetName = args.targetName.trim();
    if (!targetName) throw new SenderError('Target required');
    const target = findCharacterByName(ctx, targetName);
    if (!target) throw new SenderError('Target not found');
    if (target.id === inviter.id) throw new SenderError('Cannot invite yourself');
    if (inviter.groupId) {
      const group = ctx.db.group.id.find(inviter.groupId);
      if (!group) throw new SenderError('Group not found');
      if (group.leaderCharacterId !== inviter.id) {
        appendPrivateEvent(
          ctx,
          inviter.id,
          inviter.ownerUserId,
          'group',
          'Only the group leader can invite new members.'
        );
        return;
      }
    }

    if (target.groupId) {
      appendPrivateEvent(
        ctx,
        inviter.id,
        inviter.ownerUserId,
        'group',
        `${target.name} is already in a group.`
      );
      return;
    }

    let groupId = inviter.groupId;
    if (!groupId) {
      const group = ctx.db.group.insert({
        id: 0n,
        name: `${inviter.name}'s group`,
        leaderCharacterId: inviter.id,
        createdAt: ctx.timestamp,
      });
    ctx.db.groupMember.insert({
      id: 0n,
      groupId: group.id,
      characterId: inviter.id,
      ownerUserId: inviter.ownerUserId,
      role: 'leader',
      followLeader: true,
      joinedAt: ctx.timestamp,
    });
      ctx.db.character.id.update({ ...inviter, groupId: group.id });
      groupId = group.id;
      appendGroupEvent(ctx, groupId, inviter.id, 'group', `${inviter.name} formed a group.`);
    }

    for (const invite of ctx.db.groupInvite.by_to_character.filter(target.id)) {
      appendPrivateEvent(
        ctx,
        inviter.id,
        inviter.ownerUserId,
        'group',
        `${target.name} already has a pending invite.`
      );
      return;
    }

    ctx.db.groupInvite.insert({
      id: 0n,
      groupId,
      fromCharacterId: inviter.id,
      toCharacterId: target.id,
      createdAt: ctx.timestamp,
    });

    appendPrivateEvent(
      ctx,
      target.id,
      target.ownerUserId,
      'group',
      `${inviter.name} invited you to a group.`
    );
  }
);

spacetimedb.reducer(
  'accept_group_invite',
  { characterId: t.u64(), fromName: t.string() },
  (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (character.groupId) throw new SenderError('Character already in a group');
    const from = findCharacterByName(ctx, args.fromName.trim());
    if (!from) throw new SenderError('Inviter not found');

    let inviteRow: typeof GroupInvite.rowType | null = null;
    for (const invite of ctx.db.groupInvite.by_to_character.filter(character.id)) {
      if (invite.fromCharacterId === from.id) {
        inviteRow = invite;
        break;
      }
    }
    if (!inviteRow) throw new SenderError('Invite not found');

    const group = ctx.db.group.id.find(inviteRow.groupId);
    if (!group) throw new SenderError('Group not found');

    ctx.db.groupInvite.id.delete(inviteRow.id);
    ctx.db.groupMember.insert({
      id: 0n,
      groupId: group.id,
      characterId: character.id,
      ownerUserId: character.ownerUserId,
      role: 'member',
      followLeader: true,
      joinedAt: ctx.timestamp,
    });
    ctx.db.character.id.update({ ...character, groupId: group.id });
    appendGroupEvent(ctx, group.id, character.id, 'group', `${character.name} joined the group.`);
  }
);

spacetimedb.reducer(
  'reject_group_invite',
  { characterId: t.u64(), fromName: t.string() },
  (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const from = findCharacterByName(ctx, args.fromName.trim());
    if (!from) throw new SenderError('Inviter not found');
    for (const invite of ctx.db.groupInvite.by_to_character.filter(character.id)) {
      if (invite.fromCharacterId === from.id) {
        ctx.db.groupInvite.id.delete(invite.id);
        appendPrivateEvent(
          ctx,
          from.id,
          from.ownerUserId,
          'group',
          `${character.name} declined your group invite.`
        );
        return;
      }
    }
  }
);
spacetimedb.reducer('attack', { combatId: t.u64(), damage: t.u64() }, (ctx, args) => {
  const combat = ctx.db.combat.id.find(args.combatId);
  if (!combat) throw new SenderError('Combat not found');
  const character = requireCharacterOwnedBy(ctx, combat.characterId);

  if (combat.status !== 'active') throw new SenderError('Combat is not active');
  const newHp = combat.enemyHp > args.damage ? combat.enemyHp - args.damage : 0n;
  ctx.db.combat.id.update({ ...combat, enemyHp: newHp, updatedAt: ctx.timestamp });

  appendPrivateEvent(ctx, character.id, requirePlayerUserId(ctx), 'combat', `You strike for ${args.damage} damage.`);

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
      appendPrivateEvent(ctx, character.id, requirePlayerUserId(ctx), 'system', `You reached level ${newLevel}!`);
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
    appendPrivateEvent(
      ctx,
      character.id,
      requirePlayerUserId(ctx),
      'combat',
      `You defeated ${combat.enemyName}! +${reward} XP.`
    );

    if (character.groupId) {
      appendGroupEvent(
        ctx,
        character.groupId,
        character.id,
        'combat',
        `${character.name} defeated ${combat.enemyName}.`
      );
    }
  }
});

spacetimedb.reducer('end_combat', { combatId: t.u64(), reason: t.string() }, (ctx, args) => {
  const combat = ctx.db.combat.id.find(args.combatId);
  if (!combat) throw new SenderError('Combat not found');
  const character = requireCharacterOwnedBy(ctx, combat.characterId);

  if (combat.status !== 'active') return;
  ctx.db.combat.id.update({ ...combat, status: 'ended', updatedAt: ctx.timestamp });
  appendPrivateEvent(ctx, character.id, requirePlayerUserId(ctx), 'combat', `Combat ended: ${args.reason}`);

  if (character.groupId) {
    appendGroupEvent(
      ctx,
      character.groupId,
      character.id,
      'combat',
      `${character.name} ended combat (${args.reason}).`
    );
  }
});
