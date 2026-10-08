import { describe, expect, it } from 'vitest';
import {
  encounterHeading,
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

  it('renders max HP 0 as an empty bar and 0/0', () => {
    const [view] = hostileViews(input({ enemies: [enemy(1n, { currentHp: 0n, maxHp: 0n })] }));
    expect(view.widthPercent).toBe('0%');
    expect(view.hpText).toBe('0/0');
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
    expect(view.hpText).toBe('0/50');
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
    expect(view.ariaLabel).toBe('Rotfang, level 4, Tough, 44% health');
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
    expect(view.ariaLabel).toBe('Rotfang, level 4, Tough, 44% health, boss, winding up Bile Spray');
  });

  it('omits the level part without a template', () => {
    const [view] = hostileViews(
      input({ enemies: [enemy(1n, { displayName: 'Rotfang', currentHp: 50n, maxHp: 100n })], templates: [] }),
    );
    expect(view.ariaLabel).toBe('Rotfang, Even match, 50% health');
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
    expect(view.ariaLabel.startsWith(`${XSS}, level 3`)).toBe(true);
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
      'Rotfang, level 3, Even match, 100% health, Ignite on Rotfang, 3 rounds left, Sunder on Rotfang, 1 round left',
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

  it('words the heading for one, many and zero', () => {
    expect(encounterHeading(1)).toBe('Encounter · 1 hostile');
    expect(encounterHeading(3)).toBe('Encounter · 3 hostiles');
    expect(encounterHeading(0)).toBe('Encounter · 0 hostiles');
  });
});
