import { describe, expect, it } from 'vitest';
import {
  CREATURE_DENSITY_WORDS,
  NOTHING_HUNTS,
  RESOURCE_DENSITY_WORDS,
  SLAIN_NAMED_LINE,
  creatureLine,
  groupHint,
  harvestCapRefusal,
  resourceLine,
} from '@game-data/density_lines';
import { conFor } from '../combat/difficulty';
import {
  GATHER_BUSY_REASON,
  NEARBY_COPY,
  allExhausted,
  familyRows,
  namedRows,
  nearbyGroups,
  resourceRows,
} from './pools';
import type { FamilyRow, NamedRow, PoolLike, ResourceRow } from './pools';

// 51.3.1.1-19 Task 1: the pure Nearby view models (UI-SPEC "Nearby: Creatures / Named & quest
// targets / Resources", UI Considerations Q1-Q3). Copy comes from @game-data/density_lines.

let nextId = 100n;

function creature(over: Partial<PoolLike> = {}): PoolLike {
  nextId += 1n;
  return {
    id: nextId,
    locationId: 10n,
    kind: 'creature',
    level: 2n,
    lvLo: 4n,
    lvHi: 5n,
    name: 'Goblins',
    iconKey: 'humanoid',
    temperament: 'aggressive',
    singularNoun: 'goblin',
    pluralNoun: 'goblins',
    timeOfDay: 'any',
    ...over,
  };
}

function resource(over: Partial<PoolLike> = {}): PoolLike {
  nextId += 1n;
  return {
    id: nextId,
    locationId: 10n,
    kind: 'resource',
    level: 2n,
    lvLo: 0n,
    lvHi: 0n,
    name: 'Panlight Salt',
    iconKey: 'mineral',
    temperament: '',
    singularNoun: '',
    pluralNoun: '',
    timeOfDay: 'any',
    ...over,
  };
}

const PLACE = 'the pans';

describe('familyRows', () => {
  it('builds the card fields from the pool row and the shared copy', () => {
    const pool = creature({ id: 7n, level: 3n });
    const [row] = familyRows([pool], 4n, PLACE);
    const con = conFor(5n, 4n);
    expect(row).toEqual<FamilyRow>({
      poolId: 7n,
      name: 'Goblins',
      iconKey: 'humanoid',
      levelText: 'Lv 4-5',
      con,
      badgeWord: 'Overrun',
      badgeLevel: 3,
      line: creatureLine({ plural: 'goblins', singular: 'goblin', temperament: 'aggressive', level: 3, place: PLACE }),
      hint: 'Expect a crowd',
      pullable: true,
      pullLabel: 'Pull Goblins',
      title: `Goblins · ${con.meaning}`,
    });
    expect(row.title).toBe('Goblins · Tough');
  });

  it('shows a single level when the range is one level', () => {
    const [row] = familyRows([creature({ lvLo: 6n, lvHi: 6n })], 4n, PLACE);
    expect(row.levelText).toBe('Lv 6');
  });

  it('keeps the con null and the title bare while the player level is unknown', () => {
    const [row] = familyRows([creature()], null, PLACE);
    expect(row.con).toBeNull();
    expect(row.title).toBe('Goblins');
  });

  it('writes the hint and the badge word for every level', () => {
    for (const level of [0, 1, 2, 3]) {
      const [row] = familyRows([creature({ level: BigInt(level) })], 4n, PLACE);
      expect(row.badgeWord).toBe(CREATURE_DENSITY_WORDS[level]);
      expect(row.badgeLevel).toBe(level);
      expect(row.hint).toBe(groupHint(level));
    }
  });

  it('level 0 (Wiped out) keeps the card with its line but no hint and no Pull', () => {
    const [row] = familyRows([creature({ level: 0n })], 4n, PLACE);
    expect(row.badgeWord).toBe('Wiped out');
    expect(row.hint).toBe('');
    expect(row.pullable).toBe(false);
    expect(row.line).toBe('No goblins are left in the pans. The quiet feels borrowed.');
  });

  it('uses the area when the place has no noun', () => {
    const [row] = familyRows([creature({ level: 2n })], 4n, '');
    expect(row.line).toBe('Goblins patrol the area, in no hurry to be anywhere else.');
  });

  it('falls back to the family name for missing nouns', () => {
    const [row] = familyRows([creature({ name: 'Ash Wolves', pluralNoun: '', singularNoun: '', level: 2n })], 4n, PLACE);
    expect(row.line).toBe('Ash wolves patrol the pans, in no hurry to be anywhere else.');
  });

  it('orders danger first: density desc, level top desc, name, id; wiped out last', () => {
    const rows = familyRows(
      [
        creature({ id: 1n, name: 'Rats', level: 0n, lvHi: 20n }),
        creature({ id: 2n, name: 'Wisps', level: 2n, lvHi: 5n }),
        creature({ id: 3n, name: 'Goblins', level: 3n, lvHi: 4n }),
        creature({ id: 4n, name: 'bats', level: 2n, lvHi: 5n }),
        creature({ id: 6n, name: 'Crabs', level: 2n, lvHi: 9n }),
        creature({ id: 5n, name: 'Bats', level: 2n, lvHi: 5n }),
        creature({ id: 7n, name: 'Moths', level: 1n, lvHi: 30n }),
      ],
      4n,
      PLACE,
    );
    expect(rows.map((r) => r.poolId)).toEqual([3n, 6n, 4n, 5n, 2n, 7n, 1n]);
  });

  it('lists creature pools only', () => {
    const rows = familyRows([creature({ id: 1n }), resource({ id: 2n })], 4n, PLACE);
    expect(rows.map((r) => r.poolId)).toEqual([1n]);
  });
});

describe('namedRows', () => {
  const templates = [
    { id: 1n, level: 7n, isBoss: false },
    { id: 2n, level: 9n, isBoss: true },
    { id: 3n, level: 5n },
  ];

  it('builds a living named row with the sub-line and Fight label', () => {
    const [row] = namedRows([{ id: 11n, name: 'Old Brannoc', enemyTemplateId: 1n, isAlive: true }], [], templates, [], 6n);
    expect(row).toMatchObject<Partial<NamedRow>>({
      key: 'named-11',
      kind: 'named',
      id: 11n,
      name: 'Old Brannoc',
      boss: false,
      levelText: 'Lv 7',
      subLine: 'Named · Lv 7',
      state: 'alive',
      fightable: true,
      fightLabel: 'Fight Old Brannoc',
      title: 'Old Brannoc · Tough',
    });
    expect(row.con).toEqual(conFor(7n, 6n));
  });

  it('a boss reads Boss; a quest target adds Quest: {name}', () => {
    const [row] = namedRows(
      [{ id: 12n, name: 'The Pale King', enemyTemplateId: 2n, isAlive: true }],
      [],
      templates,
      [{ name: 'Crown of Ash', targetEnemyTemplateId: 2n }],
      6n,
    );
    expect(row.boss).toBe(true);
    expect(row.subLine).toBe('Boss · Quest: Crown of Ash · Lv 9');
  });

  it('omits the level while the template is unknown and keeps Named', () => {
    const [row] = namedRows([{ id: 13n, name: 'Vesk', enemyTemplateId: 99n, isAlive: true }], [], templates, [], 6n);
    expect(row.subLine).toBe('Named');
    expect(row.levelText).toBeNull();
    expect(row.con).toBeNull();
    expect(row.title).toBe('Vesk');
    expect(row.fightable).toBe(true);
  });

  it('a slain named row reads the slain line and cannot be fought', () => {
    const [row] = namedRows([{ id: 14n, name: 'Vesk', enemyTemplateId: 1n, isAlive: false }], [], templates, [], 6n);
    expect(row.subLine).toBe(SLAIN_NAMED_LINE);
    expect(row.state).toBe('slain');
    expect(row.fightable).toBe(false);
    expect(row.key).toBe('named-14');
  });

  it('an event spawn is an individual; engaged adds In combat and blocks Fight', () => {
    const rows = namedRows(
      [],
      [
        { id: 21n, name: 'Ember Herald', state: 'available', enemyTemplateId: 3n, level: 6n },
        { id: 22n, name: 'Cinder Maw', state: 'engaged', enemyTemplateId: 2n, level: 0n, lockedCombatId: 4n },
        { id: 23n, name: 'Gone', state: 'depleted', enemyTemplateId: 3n, level: 6n },
      ],
      templates,
      [],
      6n,
    );
    expect(rows.map((r) => r.name)).toEqual(['Cinder Maw', 'Ember Herald']);
    const maw = rows[0];
    expect(maw).toMatchObject({ kind: 'event', key: 'event-22', state: 'inCombat', fightable: false, boss: true });
    expect(maw.subLine).toBe('Boss · Lv 9 · In combat');
    const herald = rows[1];
    expect(herald).toMatchObject({ kind: 'event', state: 'alive', fightable: true, subLine: 'Named · Lv 6' });
  });

  it('orders living before slain, then level top desc, then name', () => {
    const rows = namedRows(
      [
        { id: 1n, name: 'Zed', enemyTemplateId: 3n, isAlive: true },
        { id: 2n, name: 'Ash', enemyTemplateId: 2n, isAlive: false },
        { id: 3n, name: 'Bea', enemyTemplateId: 3n, isAlive: true },
        { id: 4n, name: 'Cid', enemyTemplateId: 2n, isAlive: true },
      ],
      [],
      templates,
      [],
      6n,
    );
    expect(rows.map((r) => r.name)).toEqual(['Cid', 'Bea', 'Zed', 'Ash']);
  });
});

describe('resourceRows', () => {
  const NOW = 1_000_000n;

  it('builds the card fields from the pool row and the shared copy', () => {
    const pool = resource({ id: 31n, level: 3n });
    const [row] = resourceRows([pool], false, [], false, NOW, PLACE);
    expect(row).toEqual<ResourceRow>({
      poolId: 31n,
      name: 'Panlight Salt',
      iconKey: 'mineral',
      badgeWord: 'Abundant',
      badgeLevel: 3,
      line: resourceLine({ resource: 'Panlight Salt', level: 3, place: PLACE }),
      reason: null,
      capped: false,
      gatherable: true,
      gatherLabel: 'Gather Panlight Salt',
      title: 'Panlight Salt',
    });
  });

  it('lists only pools available at this time of day', () => {
    const pools = [
      resource({ id: 1n, name: 'Salt', timeOfDay: 'any' }),
      resource({ id: 2n, name: 'Moonmoss', timeOfDay: 'night' }),
      resource({ id: 3n, name: 'Sunwort', timeOfDay: 'day' }),
    ];
    expect(resourceRows(pools, false, [], false, NOW, PLACE).map((r) => r.name)).toEqual(['Salt', 'Sunwort']);
    expect(resourceRows(pools, true, [], false, NOW, PLACE).map((r) => r.name)).toEqual(['Moonmoss', 'Salt']);
  });

  it('lists every pool while the time of day is unknown (the server still refuses out of time)', () => {
    const pools = [resource({ id: 2n, name: 'Moonmoss', timeOfDay: 'night' }), resource({ id: 3n, name: 'Sunwort', timeOfDay: 'day' })];
    expect(resourceRows(pools, null, [], false, NOW, PLACE)).toHaveLength(2);
  });

  it('the harvest cap of this place disables Gather with its reason until it expires', () => {
    const pool = resource({ locationId: 10n });
    const capped = resourceRows([pool], false, [{ locationId: 10n, cappedUntilMicros: NOW + 1n }], false, NOW, PLACE)[0];
    expect(capped.capped).toBe(true);
    expect(capped.reason).toBe(harvestCapRefusal());
    expect(capped.reason).toBe('You have taken what you can carry from here for now.');
    const expired = resourceRows([pool], false, [{ locationId: 10n, cappedUntilMicros: NOW }], false, NOW, PLACE)[0];
    expect(expired.capped).toBe(false);
    expect(expired.reason).toBeNull();
    const elsewhere = resourceRows([pool], false, [{ locationId: 11n, cappedUntilMicros: NOW + 9n }], false, NOW, PLACE)[0];
    expect(elsewhere.reason).toBeNull();
  });

  it('an in-progress gather disables Gather with its reason', () => {
    const [row] = resourceRows([resource()], false, [], true, NOW, PLACE);
    expect(row.reason).toBe(GATHER_BUSY_REASON);
    expect(row.reason).toBe('Finish gathering first.');
  });

  it('level 0 (Exhausted) has no Gather and no reason', () => {
    const [row] = resourceRows([resource({ level: 0n })], false, [{ locationId: 10n, cappedUntilMicros: NOW + 5n }], true, NOW, PLACE);
    expect(row.gatherable).toBe(false);
    expect(row.reason).toBeNull();
    expect(row.badgeWord).toBe('Exhausted');
    expect(row.line).toBe('There is no panlight salt left in the pans, for now.');
  });

  it('writes the badge word for every level', () => {
    for (const level of [0, 1, 2, 3]) {
      const [row] = resourceRows([resource({ level: BigInt(level) })], false, [], false, NOW, PLACE);
      expect(row.badgeWord).toBe(RESOURCE_DENSITY_WORDS[level]);
    }
  });

  it('orders densest first, then name, then id; creature pools are not listed', () => {
    const rows = resourceRows(
      [
        resource({ id: 1n, name: 'Salt', level: 1n }),
        resource({ id: 2n, name: 'Reed', level: 3n }),
        resource({ id: 3n, name: 'ash', level: 1n }),
        resource({ id: 4n, name: 'Iron', level: 0n }),
        creature({ id: 5n }),
      ],
      false,
      [],
      false,
      NOW,
      PLACE,
    );
    expect(rows.map((r) => r.poolId)).toEqual([2n, 3n, 1n, 4n]);
  });
});

describe('allExhausted', () => {
  const NOW = 0n;
  it('is true only with at least one row and every row at level 0', () => {
    expect(allExhausted([])).toBe(false);
    const zero = resourceRows([resource({ level: 0n }), resource({ level: 0n, name: 'Reed' })], false, [], false, NOW, PLACE);
    expect(allExhausted(zero)).toBe(true);
    const mixed = resourceRows([resource({ level: 0n }), resource({ level: 1n, name: 'Reed' })], false, [], false, NOW, PLACE);
    expect(allExhausted(mixed)).toBe(false);
  });
});

describe('nearbyGroups', () => {
  const families = familyRows([creature()], 4n, PLACE);
  const named = namedRows([{ id: 1n, name: 'Vesk', enemyTemplateId: 1n, isAlive: true }], [], [], [], 4n);
  const resources = resourceRows([resource()], false, [], false, 0n, PLACE);
  const base = { isSafe: false, isUncharted: false, ready: true, families, named, resources, place: PLACE, others: 1 };

  it('renders the three groups in order once ready', () => {
    const groups = nearbyGroups(base);
    expect(groups.creatures).toEqual({ rows: families, emptyLine: null });
    expect(groups.named).toEqual(named);
    expect(groups.resources).toEqual({ rows: resources, summary: null });
    expect(groups.alsoHereLabel).toBe(true);
    expect(groups.nothingAtAll).toBe(false);
  });

  it('shows nothing at all until the place pool rows have applied', () => {
    const groups = nearbyGroups({ ...base, ready: false });
    expect(groups.creatures).toBeNull();
    expect(groups.named).toBeNull();
    expect(groups.resources).toBeNull();
    expect(groups.alsoHereLabel).toBe(false);
    expect(groups.nothingAtAll).toBe(false);
  });

  it('has no Creatures group at a safe or uncharted place', () => {
    expect(nearbyGroups({ ...base, isSafe: true }).creatures).toBeNull();
    expect(nearbyGroups({ ...base, isUncharted: true }).creatures).toBeNull();
    expect(nearbyGroups({ ...base, isSafe: true, families: [] }).creatures).toBeNull();
  });

  it('says Nothing hunts here now. at a non-safe place with no family pools', () => {
    const groups = nearbyGroups({ ...base, families: [] });
    expect(groups.creatures).toEqual({ rows: [], emptyLine: NOTHING_HUNTS });
    expect(NOTHING_HUNTS).toBe('Nothing hunts here now.');
  });

  it('keeps wiped-out family cards with no empty line', () => {
    const wiped = familyRows([creature({ level: 0n })], 4n, PLACE);
    expect(nearbyGroups({ ...base, families: wiped }).creatures).toEqual({ rows: wiped, emptyLine: null });
  });

  it('omits the Named & quest targets group with none', () => {
    expect(nearbyGroups({ ...base, named: [] }).named).toBeNull();
  });

  it('omits Resources with no pools; every pool Exhausted keeps the cards and adds the summary', () => {
    expect(nearbyGroups({ ...base, resources: [] }).resources).toBeNull();
    const gone = resourceRows([resource({ level: 0n })], false, [], false, 0n, PLACE);
    expect(nearbyGroups({ ...base, resources: gone }).resources).toEqual({
      rows: gone,
      summary: 'Everything worth taking has been picked from the pans.',
    });
  });

  it('Also here is labelled only when a group above renders; No one is nearby. only when everything is empty', () => {
    const quiet = { ...base, isSafe: true, families: [], named: [], resources: [], others: 0 };
    expect(nearbyGroups({ ...quiet, others: 2 })).toMatchObject({ alsoHereLabel: false, nothingAtAll: false });
    expect(nearbyGroups(quiet)).toMatchObject({ alsoHereLabel: false, nothingAtAll: true });
    // A non-safe place with no families still renders its Creatures group (the empty line).
    expect(nearbyGroups({ ...quiet, isSafe: false })).toMatchObject({ alsoHereLabel: false, nothingAtAll: false });
    expect(nearbyGroups({ ...quiet, isSafe: false, others: 1 })).toMatchObject({ alsoHereLabel: true, nothingAtAll: false });
    // No one else here: no label over an empty list.
    expect(nearbyGroups({ ...base, others: 0 }).alsoHereLabel).toBe(false);
  });
});

describe('copy', () => {
  it('names the groups and actions (PROPOSED, D-58)', () => {
    expect(NEARBY_COPY.groups).toEqual({
      creatures: 'Creatures',
      named: 'Named & quest targets',
      resources: 'Resources',
      alsoHere: 'Also here',
    });
    expect(NEARBY_COPY.actions).toEqual({ pull: 'Pull', fight: 'Fight', gather: 'Gather' });
  });
});

describe('privacy (D-05)', () => {
  it('no produced string holds a digit except the Lv range', () => {
    const pools = [
      creature({ level: 3n, lvLo: 12n, lvHi: 14n }),
      creature({ level: 1n, temperament: 'skittish', name: 'Wisps', pluralNoun: 'wisps', singularNoun: 'wisp' }),
      creature({ level: 0n, temperament: 'wary' }),
      resource({ level: 2n }),
      resource({ level: 0n, name: 'Reed' }),
    ];
    const fam = familyRows(pools, 13n, PLACE);
    const res = resourceRows(pools, false, [{ locationId: 10n, cappedUntilMicros: 999_999n }], false, 5n, PLACE);
    const nam = namedRows(
      [{ id: 1n, name: 'Vesk', enemyTemplateId: 1n, isAlive: false }],
      [{ id: 2n, name: 'Herald', state: 'engaged', enemyTemplateId: 1n, level: 8n }],
      [{ id: 1n, level: 8n, isBoss: false }],
      [{ name: 'Ash Road', targetEnemyTemplateId: 1n }],
      6n,
    );
    const strings: string[] = [];
    for (const row of fam) strings.push(row.name, row.line, row.hint, row.badgeWord, row.pullLabel, row.title);
    for (const row of res) strings.push(row.name, row.line, row.badgeWord, row.gatherLabel, row.title, row.reason ?? '');
    for (const row of nam) strings.push(row.name, row.fightLabel, row.title, row.subLine.replace(/Lv \d+/g, ''));
    for (const text of strings) expect(text).not.toMatch(/\d/);
    for (const row of fam) expect(row.levelText).toMatch(/^Lv \d+(-\d+)?$/);
  });
});
