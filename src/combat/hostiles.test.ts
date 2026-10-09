import { describe, expect, it } from 'vitest';
import {
  encounterHeading,
  encounterSourceView,
  encounterTitle,
  hostileViews,
  livingHostileIds,
  type HostileViewsInput,
} from './hostiles';
import { conFor } from './difficulty';

const XSS = '<img src=x onerror=alert(1)>';

function enemy(id: bigint, over: Partial<HostileViewsInput['enemies'][number]> = {}) {
  return {
    id,
    enemyTemplateId: 100n,
    displayName: `Enemy ${id}`,
    currentHp: 100n,
    maxHp: 100n,
    ...over,
  };
}

function input(over: Partial<HostileViewsInput> = {}): HostileViewsInput {
  return {
    enemies: [enemy(1n)],
    templates: [{ id: 100n, level: 3n }],
    abilities: [{ enemyTemplateId: 100n, abilityKey: 'bile_spray', name: 'Bile Spray' }],
    casts: [],
    currentRound: 4n,
    playerLevel: 3n,
    targetId: null,
    selfId: 1n,
    characterNames: new Map(),
    petNames: new Map(),
    ...over,
  };
}

describe('hostileViews ordering and HP', () => {
  it('lists every enemy in ascending id', () => {
    const views = hostileViews(input({ enemies: [enemy(9n), enemy(3n), enemy(5n)] }));
    expect(views.map((v) => v.id)).toEqual([3n, 5n, 9n]);
  });

  it('does not reorder the caller array', () => {
    const enemies = [enemy(9n), enemy(3n)];
    hostileViews(input({ enemies }));
    expect(enemies.map((e) => e.id)).toEqual([9n, 3n]);
  });

  it('formats HP text and a clamped width', () => {
    const [view] = hostileViews(input({ enemies: [enemy(1n, { currentHp: 212n, maxHp: 480n })] }));
    expect(view.hpText).toBe('212/480');
    expect(view.percent).toBe(44);
    expect(view.widthPercent).toBe('44.17%');
    expect(view.hp).toBe(212n);
    expect(view.maxHp).toBe(480n);
  });

  it('clamps current HP above max to 100%', () => {
    const [view] = hostileViews(input({ enemies: [enemy(1n, { currentHp: 600n, maxHp: 480n })] }));
    expect(view.widthPercent).toBe('100%');
    expect(view.percent).toBe(100);
  });

  it('renders max HP 0 as an empty bar and Down (a 0 HP row is defeated)', () => {
    const [view] = hostileViews(input({ enemies: [enemy(1n, { currentHp: 0n, maxHp: 0n })] }));
    expect(view.widthPercent).toBe('0%');
    expect(view.hpText).toBe('Down');
    expect(view.percent).toBe(0);
  });

  it('returns no views for no enemies', () => {
    expect(hostileViews(input({ enemies: [] }))).toEqual([]);
  });
});

describe('hostileViews target and defeated state', () => {
  it('marks a living hostile as targeted', () => {
    const [view] = hostileViews(input({ targetId: 1n }));
    expect(view.targeted).toBe(true);
    expect(view.defeated).toBe(false);
  });

  it('never targets a defeated hostile, even when the target id matches', () => {
    const [view] = hostileViews(
      input({ enemies: [enemy(1n, { currentHp: 0n, maxHp: 50n })], targetId: 1n }),
    );
    expect(view.defeated).toBe(true);
    expect(view.targeted).toBe(false);
    expect(view.hpText).toBe('Down');
  });

  it('marks only the matching hostile', () => {
    const views = hostileViews(input({ enemies: [enemy(1n), enemy(2n)], targetId: 2n }));
    expect(views.map((v) => v.targeted)).toEqual([false, true]);
  });
});

describe('hostileViews boss flag and level', () => {
  it('flags a boss only when isBoss is exactly true', () => {
    const boss = hostileViews(input({ templates: [{ id: 100n, level: 3n, isBoss: true }] }))[0];
    const falsy = hostileViews(input({ templates: [{ id: 100n, level: 3n, isBoss: false }] }))[0];
    const unset = hostileViews(input())[0];
    expect(boss.isBoss).toBe(true);
    expect(falsy.isBoss).toBe(false);
    expect(unset.isBoss).toBe(false);
  });

  it('shows the level and difficulty from the template', () => {
    const [view] = hostileViews(input({ templates: [{ id: 100n, level: 4n }], playerLevel: 3n }));
    expect(view.levelText).toBe('Lv 4');
    expect(view.con.className).toBe('con-yellow');
    expect(view.con.meaning).toBe('Tough');
  });

  it('shows the enemy level, not the template level, when the fight scaled it', () => {
    const [view] = hostileViews(
      input({ enemies: [enemy(1n, { level: 5n })], templates: [{ id: 100n, level: 1n }], playerLevel: 5n }),
    );
    expect(view.levelText).toBe('Lv 5');
    expect(view.con).toEqual(conFor(5n, 5n));
    expect(view.ariaLabel).toContain(', level 5,');
  });

  it('reads the template level for an enemy with level 0 or no level', () => {
    for (const over of [{ level: 0n }, {}]) {
      const [view] = hostileViews(input({ enemies: [enemy(1n, over)], templates: [{ id: 100n, level: 4n }] }));
      expect(view.levelText).toBe('Lv 4');
      expect(view.ariaLabel).toContain(', level 4,');
    }
  });

  it('still renders a row with no level text and an even match when the template is missing', () => {
    const [view] = hostileViews(input({ templates: [] }));
    expect(view.levelText).toBeNull();
    expect(view.con.className).toBe('con-white');
    expect(view.con.meaning).toBe('Even match');
    expect(view.isBoss).toBe(false);
  });
});

describe('hostileViews wind-ups', () => {
  const cast = {
    id: 1n,
    enemyId: 5n,
    abilityKey: 'bile_spray',
    targetCharacterId: 1n,
    announcedRound: 3n,
    landsAtRound: 5n,
  };

  it('builds the rail row with the live N', () => {
    const views = hostileViews(
      input({ enemies: [enemy(5n, { displayName: 'Rotfang' })], casts: [cast], currentRound: 4n }),
    );
    expect(views[0].windups).toHaveLength(1);
    expect(views[0].windups[0].text).toBe('Rotfang winds up Bile Spray → you · lands in 2 rounds');
  });

  it('uses the announcement N when the round is unknown', () => {
    const views = hostileViews(
      input({ enemies: [enemy(5n, { displayName: 'Rotfang' })], casts: [cast], currentRound: null }),
    );
    expect(views[0].windups[0].text).toBe('Rotfang winds up Bile Spray → you · lands in 2 rounds');
    const other = hostileViews(
      input({
        enemies: [enemy(5n, { displayName: 'Rotfang' })],
        casts: [{ ...cast, announcedRound: 5n }],
        currentRound: null,
      }),
    );
    expect(other[0].windups[0].tail).toContain('lands this round');
  });

  it('puts each cast on its own enemy', () => {
    const views = hostileViews(
      input({
        enemies: [enemy(5n), enemy(6n)],
        casts: [cast, { ...cast, id: 2n, enemyId: 6n, abilityKey: 'rot_cloud', targetCharacterId: null }],
      }),
    );
    expect(views[0].windups).toHaveLength(1);
    expect(views[1].windups).toHaveLength(1);
    expect(views[1].windups[0].ability).toBe('rot cloud');
    expect(views[1].windups[0].tail).toContain('the party');
  });

  it('orders several casts on one enemy by cast id', () => {
    const views = hostileViews(
      input({
        enemies: [enemy(5n)],
        casts: [{ ...cast, id: 9n, abilityKey: 'rot_cloud' }, cast],
      }),
    );
    expect(views[0].windups.map((w) => w.ability)).toEqual(['Bile Spray', 'rot cloud']);
  });

  it("names the enemy ally of a heal wind-up, never 'the party' (WR-01)", () => {
    const views = hostileViews(
      input({
        enemies: [enemy(5n, { displayName: 'Hexer' }), enemy(2n, { displayName: 'Goblin Brute' })],
        abilities: [{ enemyTemplateId: 100n, abilityKey: 'mending_light', name: 'Mending Light' }],
        casts: [
          { ...cast, abilityKey: 'mending_light', targetCharacterId: null, targetPetId: null, targetEnemyId: 2n },
        ],
        currentRound: 4n,
      }),
    );
    const hexer = views.find((view) => view.id === 5n)!;
    expect(hexer.windups[0].text).toBe('Hexer winds up Mending Light → Goblin Brute · lands in 2 rounds');
    expect(hexer.windups[0].tail).not.toContain('the party');
  });

  it('reads a pet target by its name', () => {
    const views = hostileViews(
      input({
        enemies: [enemy(5n)],
        casts: [{ ...cast, targetCharacterId: null, targetPetId: 7n }],
        petNames: new Map([[7n, 'Ember']]),
      }),
    );
    expect(views[0].windups[0].tail).toContain('→ Ember ·');
  });

  it('has no wind-ups without a cast row', () => {
    expect(hostileViews(input())[0].windups).toEqual([]);
  });
});

describe('hostileViews labels', () => {
  it('builds the aria-label and title', () => {
    const [view] = hostileViews(
      input({
        enemies: [enemy(1n, { displayName: 'Rotfang', currentHp: 212n, maxHp: 480n })],
        templates: [{ id: 100n, level: 4n }],
      }),
    );
    expect(view.ariaLabel).toBe('Rotfang, Damage, level 4, Tough, 44% health');
    expect(view.title).toBe('Rotfang · Tough');
  });

  it('adds boss and winding up parts', () => {
    const [view] = hostileViews(
      input({
        enemies: [enemy(1n, { displayName: 'Rotfang', currentHp: 212n, maxHp: 480n })],
        templates: [{ id: 100n, level: 4n, isBoss: true }],
        casts: [
          { id: 1n, enemyId: 1n, abilityKey: 'bile_spray', announcedRound: 1n, landsAtRound: 3n },
        ],
      }),
    );
    expect(view.ariaLabel).toBe('Rotfang, Boss, level 4, Tough, 44% health, boss, winding up Bile Spray');
  });

  it('omits the level part without a template', () => {
    const [view] = hostileViews(
      input({ enemies: [enemy(1n, { displayName: 'Rotfang', currentHp: 50n, maxHp: 100n })], templates: [] }),
    );
    expect(view.ariaLabel).toBe('Rotfang, Damage, Even match, 50% health');
    expect(view.title).toBe('Rotfang · Even match');
  });

  it('keeps markup-looking names as the same plain string', () => {
    const [view] = hostileViews(
      input({
        enemies: [enemy(1n, { displayName: XSS })],
        casts: [{ id: 1n, enemyId: 1n, abilityKey: 'k', announcedRound: 1n, landsAtRound: 2n }],
      }),
    );
    expect(view.name).toBe(XSS);
    expect(view.title).toBe(`${XSS} · Even match`);
    expect(view.ariaLabel.startsWith(`${XSS}, Damage, level 3`)).toBe(true);
    expect(view.windups[0].lead).toBe(`${XSS} winds up `);
  });
});

function effect(id: bigint, enemyId: bigint, over: Record<string, unknown> = {}) {
  return {
    id,
    enemyId,
    effectType: 'dot',
    magnitude: 6n,
    roundsRemaining: 3n,
    sourceAbility: 'Ignite',
    ...over,
  };
}

describe('hostileViews effects', () => {
  it('has no effects when none are given', () => {
    const [view] = hostileViews(input());
    expect(view.effects).toEqual([]);
  });

  it('gives each hostile only its own effects, in ascending id', () => {
    const views = hostileViews(
      input({
        enemies: [enemy(1n), enemy(2n), enemy(3n)],
        effects: [
          effect(8n, 2n, { effectType: 'armor_down', sourceAbility: 'Sunder' }),
          effect(5n, 2n),
          effect(6n, 1n, { effectType: 'stun', sourceAbility: 'Bash' }),
        ],
      }),
    );
    expect(views.map((v) => v.effects.map((e) => e.id))).toEqual([[6n], [5n, 8n], []]);
  });

  it('reads the type in the vocabulary words and the rounds as N rounds', () => {
    const [view] = hostileViews(
      input({
        effects: [
          effect(1n, 1n),
          effect(2n, 1n, { effectType: 'regen', sourceAbility: 'Mend', roundsRemaining: 1n }),
          effect(3n, 1n, { effectType: 'armor_down', sourceAbility: 'Sunder', roundsRemaining: 2n }),
          effect(4n, 1n, { effectType: 'damage_up', sourceAbility: 'Rage', roundsRemaining: 5n }),
          effect(5n, 1n, { effectType: 'stun', sourceAbility: 'Bash', roundsRemaining: 2n }),
        ],
      }),
    );
    expect(view.effects.map((e) => e.text)).toEqual([
      'Damage over time · 3 rounds',
      'Heal over time · 1 round',
      'Debuff · 2 rounds',
      'Buff · 5 rounds',
      'Crowd control · 2 rounds',
    ]);
    expect(view.effects.map((e) => e.compactText)).toEqual(['3 rounds', '1 round', '2 rounds', '5 rounds', '2 rounds']);
    expect(view.effects[0].title).toBe('Ignite · Damage over time · 3 rounds');
    expect(view.effects[0].polarity).toBe('debuff');
    expect(view.effects[3].polarity).toBe('buff');
  });

  it('names the effect from the type when there is no source ability, and omits a zero rounds count', () => {
    const [view] = hostileViews(
      input({
        effects: [effect(1n, 1n, { sourceAbility: null, effectType: 'damage_taken', roundsRemaining: 0n })],
      }),
    );
    expect(view.effects[0].name).toBe('damage taken');
    expect(view.effects[0].timeText).toBeNull();
    expect(view.effects[0].text).toBe('Debuff');
    expect(view.effects[0].ariaText).toBe('damage taken on Enemy 1');
  });

  it('adds "{effect} on {enemy}, N rounds left" to the aria label', () => {
    const [view] = hostileViews(
      input({
        enemies: [enemy(1n, { displayName: 'Rotfang' })],
        effects: [effect(1n, 1n), effect(2n, 1n, { sourceAbility: 'Sunder', effectType: 'armor_down', roundsRemaining: 1n })],
      }),
    );
    expect(view.effects[0].ariaText).toBe('Ignite on Rotfang, 3 rounds left');
    expect(view.effects[1].ariaText).toBe('Sunder on Rotfang, 1 round left');
    expect(view.ariaLabel).toBe(
      'Rotfang, Damage, level 3, Even match, 100% health, Ignite on Rotfang, 3 rounds left, Sunder on Rotfang, 1 round left',
    );
  });

  it('shows none on a defeated hostile', () => {
    const [view] = hostileViews(input({ enemies: [enemy(1n, { currentHp: 0n })], effects: [effect(1n, 1n)] }));
    expect(view.defeated).toBe(true);
    expect(view.effects).toEqual([]);
    expect(view.ariaLabel).not.toContain('Ignite');
  });

  it('keeps hostile effect names as plain strings', () => {
    const [view] = hostileViews(input({ effects: [effect(1n, 1n, { sourceAbility: XSS })] }));
    expect(view.effects[0].name).toBe(XSS);
    expect(view.effects[0].title).toBe(`${XSS} · Damage over time · 3 rounds`);
    expect(view.effects[0].ariaText).toBe(`${XSS} on Enemy 1, 3 rounds left`);
  });

  it('does not reorder the caller effect array', () => {
    const effects = [effect(8n, 1n), effect(5n, 1n)];
    hostileViews(input({ effects }));
    expect(effects.map((e) => e.id)).toEqual([8n, 5n]);
  });
});

describe('livingHostileIds and encounterHeading', () => {
  it('skips defeated rows', () => {
    const views = hostileViews(
      input({
        enemies: [enemy(1n), enemy(2n, { currentHp: 0n }), enemy(3n)],
      }),
    );
    expect(livingHostileIds(views)).toEqual([1n, 3n]);
  });

  it('builds the heading from the title and the living count (shared copy)', () => {
    expect(encounterHeading('Goblins', 3)).toBe('Encounter · Goblins · 3 left');
    expect(encounterHeading('', 2)).toBe('Encounter · 2 left');
    expect(encounterHeading('   ', 1)).toBe('Encounter · 1 left');
    expect(encounterHeading('Old Greymaw', 1)).toBe('Encounter · Old Greymaw · 1 left');
    expect(encounterHeading('Goblins', 0)).toBe('Encounter · Goblins · 0 left');
  });
});

describe('hostileViews role (D-40)', () => {
  it('reads the template role, healer as Support, and a missing role as Damage', () => {
    const views = hostileViews(
      input({
        enemies: [
          enemy(1n, { enemyTemplateId: 101n }),
          enemy(2n, { enemyTemplateId: 102n }),
          enemy(3n, { enemyTemplateId: 103n }),
          enemy(4n, { enemyTemplateId: 104n }),
          enemy(5n, { enemyTemplateId: 999n }),
        ],
        templates: [
          { id: 101n, level: 3n, role: 'tank' },
          { id: 102n, level: 3n, role: 'healer' },
          { id: 103n, level: 3n, role: 'caster' },
          { id: 104n, level: 3n, role: 'melee' },
        ],
      }),
    );
    expect(views.map((v) => v.role.word)).toEqual(['Tank', 'Support', 'Caster', 'Damage', 'Damage']);
  });

  it('shows Boss for a boss template and Named for a named template or a named fight', () => {
    const boss = hostileViews(input({ templates: [{ id: 100n, level: 3n, role: 'tank', isBoss: true }] }))[0];
    expect(boss.role.key).toBe('boss');
    const named = hostileViews(
      input({ templates: [{ id: 100n, level: 3n, role: 'healer' }], namedTemplateIds: new Set([100n]) }),
    )[0];
    expect(named.role.key).toBe('named');
    const namedFight = hostileViews(input({ templates: [{ id: 100n, level: 3n, role: 'tank' }], namedFight: true }))[0];
    expect(namedFight.role.key).toBe('named');
    const plain = hostileViews(
      input({ templates: [{ id: 100n, level: 3n, role: 'tank' }], namedTemplateIds: new Set([7n]) }),
    )[0];
    expect(plain.role.key).toBe('tank');
  });

  it('puts the role word after the name in the aria label', () => {
    const [view] = hostileViews(
      input({
        enemies: [enemy(1n, { displayName: 'Mender', currentHp: 50n, maxHp: 100n })],
        templates: [{ id: 100n, level: 3n, role: 'healer' }],
      }),
    );
    expect(view.ariaLabel).toBe('Mender, Support, level 3, Even match, 50% health');
  });
});

describe('hostileViews intent (D-40 target line)', () => {
  const names = new Map<bigint, string>([
    [1n, 'Hero'],
    [2n, 'Mara'],
  ]);

  it('reads Targeting you when the aggro target is the viewer', () => {
    const [view] = hostileViews(
      input({ enemies: [enemy(5n, { aggroTargetCharacterId: 1n })], selfId: 1n, characterNames: names }),
    );
    expect(view.intent).toEqual({ kind: 'targeting', name: 'you', self: true });
    expect(view.ariaLabel.endsWith(', targeting you')).toBe(true);
  });

  it('reads Targeting {name} for another character', () => {
    const [view] = hostileViews(
      input({ enemies: [enemy(5n, { aggroTargetCharacterId: 2n })], selfId: 1n, characterNames: names }),
    );
    expect(view.intent).toEqual({ kind: 'targeting', name: 'Mara', self: false });
    expect(view.ariaLabel.endsWith(', targeting Mara')).toBe(true);
  });

  it('checks the pet column first and shows the pet name', () => {
    const [view] = hostileViews(
      input({
        enemies: [enemy(5n, { aggroTargetPetId: 7n, aggroTargetCharacterId: 1n })],
        selfId: 1n,
        characterNames: names,
        petNames: new Map([[7n, 'Ember']]),
      }),
    );
    expect(view.intent).toEqual({ kind: 'targeting', name: 'Ember', self: false });
  });

  it('shows no target line until a target is known, or while its name has not arrived', () => {
    const none = hostileViews(input({ enemies: [enemy(5n)] }))[0];
    expect(none.intent).toEqual({ kind: 'none', name: null, self: false });
    expect(none.ariaLabel).not.toContain('targeting');
    const zero = hostileViews(input({ enemies: [enemy(5n, { aggroTargetCharacterId: 0n, aggroTargetPetId: 0n })] }))[0];
    expect(zero.intent.kind).toBe('none');
    const unknown = hostileViews(
      input({ enemies: [enemy(5n, { aggroTargetCharacterId: 9n })], selfId: 1n, characterNames: names }),
    )[0];
    expect(unknown.intent.kind).toBe('none');
    const unknownPet = hostileViews(input({ enemies: [enemy(5n, { aggroTargetPetId: 8n })] }))[0];
    expect(unknownPet.intent.kind).toBe('none');
  });

  it('reads Healing {ally} only with a living heal target, ahead of the aggro target', () => {
    const views = hostileViews(
      input({
        enemies: [
          enemy(5n, { displayName: 'Mender', healTargetEnemyId: 6n, aggroTargetCharacterId: 1n }),
          enemy(6n, { displayName: 'Brute' }),
        ],
        selfId: 1n,
        characterNames: names,
      }),
    );
    expect(views[0].intent).toEqual({ kind: 'healing', name: 'Brute', self: false });
    expect(views[0].ariaLabel.endsWith(', healing Brute')).toBe(true);
  });

  it('falls back to the aggro target when the heal target is gone or down', () => {
    const down = hostileViews(
      input({
        enemies: [enemy(5n, { healTargetEnemyId: 6n, aggroTargetCharacterId: 2n }), enemy(6n, { currentHp: 0n })],
        selfId: 1n,
        characterNames: names,
      }),
    )[0];
    expect(down.intent).toEqual({ kind: 'targeting', name: 'Mara', self: false });
    const gone = hostileViews(input({ enemies: [enemy(5n, { healTargetEnemyId: 42n })] }))[0];
    expect(gone.intent.kind).toBe('none');
  });

  it('a defeated enemy reads Down, has no intent and says out of the fight in its label', () => {
    const [view] = hostileViews(
      input({
        enemies: [enemy(5n, { displayName: 'Brute', currentHp: 0n, maxHp: 480n, aggroTargetCharacterId: 1n })],
        selfId: 1n,
        characterNames: names,
      }),
    );
    expect(view.defeated).toBe(true);
    expect(view.hpText).toBe('Down');
    expect(view.widthPercent).toBe('0%');
    expect(view.intent).toEqual({ kind: 'none', name: null, self: false });
    expect(view.ariaLabel.endsWith(', out of the fight')).toBe(true);
  });

  it('keeps markup-looking target names as plain strings', () => {
    const [view] = hostileViews(
      input({ enemies: [enemy(5n, { aggroTargetCharacterId: 2n })], characterNames: new Map([[2n, XSS]]) }),
    );
    expect(view.intent.name).toBe(XSS);
  });
});

describe('encounterTitle and encounterSourceView (D-32)', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    origin: 'pull',
    originName: 'Goblins',
    originPlural: 'goblins',
    originLevel: 2n,
    ...over,
  });

  it('titles a family fight with the family name and a named fight with the enemy name', () => {
    expect(encounterTitle(row(), [])).toBe('Goblins');
    expect(encounterTitle(row({ origin: 'named', originName: 'Cave Rat' }), [{ name: 'Old Greymaw' }])).toBe(
      'Old Greymaw',
    );
    expect(encounterTitle(row({ origin: 'named', originName: 'Cave Rat' }), [])).toBe('Cave Rat');
    expect(encounterTitle(row({ origin: '', originName: '' }), [{ name: 'Rat' }])).toBe('');
    expect(encounterTitle(null, [{ name: 'Rat' }])).toBe('');
  });

  it('reads a pull with the capitalised plural and the density word at pull time', () => {
    expect(encounterSourceView(row())).toEqual({ text: 'Pulled from Goblins that read stable here.', tone: 'neutral' });
    expect(encounterSourceView(row({ originLevel: 3n }))?.text).toBe('Pulled from Goblins that read overrun here.');
    expect(encounterSourceView(row({ originLevel: 1n, originPlural: 'salt skitterers' }))?.text).toBe(
      'Pulled from Salt skitterers that read scarce here.',
    );
  });

  it('tones the ambush origins and words each origin from the shared copy', () => {
    expect(encounterSourceView(row({ origin: 'ambush_enter' }))).toEqual({ text: 'Ambushed on the way in.', tone: 'ambush' });
    expect(encounterSourceView(row({ origin: 'ambush_leave' }))).toEqual({ text: 'Ambushed on the way out.', tone: 'ambush' });
    expect(encounterSourceView(row({ origin: 'ambush_gather' }))).toEqual({
      text: 'Ambushed while you gather.',
      tone: 'ambush',
    });
    expect(encounterSourceView(row({ origin: 'ambush_other' }))).toEqual({ text: 'Ambushed.', tone: 'ambush' });
    expect(encounterSourceView(row({ origin: 'named' }))).toEqual({
      text: 'A named fight. No one else comes.',
      tone: 'neutral',
    });
  });

  it('shows no source line without a recorded origin or row', () => {
    expect(encounterSourceView(row({ origin: '' }))).toBeNull();
    expect(encounterSourceView(row({ origin: 'pull', originPlural: '' }))).toBeNull();
    expect(encounterSourceView(row({ origin: 'something_new' }))).toBeNull();
    expect(encounterSourceView(null)).toBeNull();
  });

  it('keeps a markup-looking plural as a plain string', () => {
    expect(encounterSourceView(row({ originPlural: XSS }))?.text).toBe(`Pulled from ${XSS} that read stable here.`);
  });
});
