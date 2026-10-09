import { describe, it, expect } from 'vitest';
import { ABILITY_KINDS, TARGET_RULES, FAMILY_ICON_KEYS, FAMILY_TEMPERAMENTS, RESOURCE_ICON_KEYS, ENEMY_ROLES } from './mechanical_vocabulary';
import { ambushVerbForms, PLACE_NOUN_BY_TERRAIN } from './density_lines';
import {
  normalizeEnemyRole,
  promptRoleToServer,
  serverRoleToPrompt,
  ROLE_ORDER,
  memberAbilities,
  ROLE_NAME_WORD,
  fillerMemberName,
  pluralize,
  nounsFromTemplateName,
  temperamentForCreatureType,
  iconKeyForCreatureType,
  resourceIconKey,
  familyKey,
  questFamilyKey,
  RULE_FAMILY_BANK,
  ruleFamilyHistory,
} from './family_rules';

describe('normalizeEnemyRole (D-53)', () => {
  it('maps every role word the world writes onto the four server roles', () => {
    const cases: [string | null | undefined, string][] = [
      ['melee', 'damage'],
      ['ranged', 'damage'],
      ['dps', 'damage'],
      ['damage', 'damage'],
      ['tank', 'tank'],
      ['healer', 'healer'],
      ['support', 'healer'],
      ['caster', 'caster'],
      ['', 'damage'],
      ['wizard', 'damage'],
      [null, 'damage'],
      [undefined, 'damage'],
      ['  Tank ', 'tank'],
      ['SUPPORT', 'healer'],
      ['Caster', 'caster'],
    ];
    for (const [input, expected] of cases) expect(normalizeEnemyRole(input)).toBe(expected);
  });
});

describe('prompt and server role words', () => {
  it('support is healer and back', () => {
    expect(promptRoleToServer('support')).toBe('healer');
    expect(promptRoleToServer('tank')).toBe('tank');
    expect(promptRoleToServer('caster')).toBe('caster');
    expect(promptRoleToServer('damage')).toBe('damage');
    expect(serverRoleToPrompt('healer')).toBe('support');
    expect(serverRoleToPrompt('tank')).toBe('tank');
    expect(serverRoleToPrompt('melee')).toBe('damage');
  });

  it('ROLE_ORDER lists the four server roles, tank first', () => {
    expect([...ROLE_ORDER]).toEqual(['tank', 'damage', 'healer', 'caster']);
    expect([...ROLE_ORDER].sort()).toEqual([...ENEMY_ROLES].sort());
  });
});

describe('memberAbilities (D-53, RESEARCH A6)', () => {
  it('damage: Slash and Rend (damage + dot)', () => {
    const a = memberAbilities('damage');
    expect(a.map((x) => x.kind)).toEqual(['damage', 'dot']);
    expect(a.map((x) => x.name)).toEqual(['Slash', 'Rend']);
    expect(a.map((x) => x.cooldownSeconds)).toEqual([0n, 12n]);
  });

  it('tank: Bash and Brace, a shield on self', () => {
    const a = memberAbilities('tank');
    expect(a.map((x) => x.kind)).toEqual(['damage', 'shield']);
    expect(a.map((x) => x.name)).toEqual(['Bash', 'Brace']);
    expect(a[1]!.targetRule).toBe('self');
    expect(a[1]!.cooldownSeconds).toBe(12n);
  });

  it('healer: Strike and Mend, the heal on the lowest-HP ally with a 2 s cast', () => {
    const a = memberAbilities('healer');
    expect(a.map((x) => x.kind)).toEqual(['damage', 'heal']);
    expect(a.map((x) => x.name)).toEqual(['Strike', 'Mend']);
    expect(a[1]!.targetRule).toBe('lowest_hp_ally');
    expect(a[1]!.castSeconds).toBe(2n);
    expect(a[1]!.cooldownSeconds).toBe(10n);
  });

  it('caster: Bolt and Siphon, both with a 2 s cast', () => {
    const a = memberAbilities('caster');
    expect(a.map((x) => x.kind)).toEqual(['damage', 'drain']);
    expect(a.map((x) => x.name)).toEqual(['Bolt', 'Siphon']);
    expect(a.map((x) => x.castSeconds)).toEqual([2n, 2n]);
    expect(a.map((x) => x.cooldownSeconds)).toEqual([0n, 12n]);
  });

  it('a world role word is normalized first', () => {
    expect(memberAbilities('support')).toEqual(memberAbilities('healer'));
    expect(memberAbilities('melee')).toEqual(memberAbilities('damage'));
  });

  it('every ability is valid vocabulary, never taunt or cc, keyed family_ and unique per role', () => {
    const allKeys: string[] = [];
    for (const role of ROLE_ORDER) {
      const a = memberAbilities(role);
      expect(a).toHaveLength(2);
      const keys = a.map((x) => x.abilityKey);
      expect(new Set(keys).size).toBe(keys.length);
      for (const ability of a) {
        expect(ability.abilityKey.startsWith('family_')).toBe(true);
        expect((ABILITY_KINDS as readonly string[]).includes(ability.kind)).toBe(true);
        expect((TARGET_RULES as readonly string[]).includes(ability.targetRule)).toBe(true);
        expect(['taunt', 'cc']).not.toContain(ability.kind);
        expect(typeof ability.castSeconds).toBe('bigint');
        expect(typeof ability.cooldownSeconds).toBe('bigint');
      }
      allKeys.push(...keys);
    }
    expect(allKeys.sort()).toEqual(
      ['family_slash', 'family_rend', 'family_bash', 'family_brace', 'family_strike', 'family_mend', 'family_bolt', 'family_siphon'].sort(),
    );
  });

  it('returns fresh rows each call', () => {
    const a = memberAbilities('tank');
    a[0]!.name = 'Changed';
    expect(memberAbilities('tank')[0]!.name).toBe('Bash');
  });
});

describe('filler member names', () => {
  it('base last word plus the role word', () => {
    expect(ROLE_NAME_WORD).toEqual({ tank: 'Warder', damage: 'Raider', healer: 'Mender', caster: 'Hexer' });
    expect(fillerMemberName('Salt-Crust Skitterer', 'healer')).toBe('Skitterer Mender');
    expect(fillerMemberName('Salt-Crust Skitterer', 'tank')).toBe('Skitterer Warder');
    expect(fillerMemberName('Salt-Crust Skitterer', 'damage')).toBe('Skitterer Raider');
    expect(fillerMemberName('Salt-Crust Skitterer', 'caster')).toBe('Skitterer Hexer');
    expect(fillerMemberName('Goblin', 'support')).toBe('Goblin Mender');
    expect(fillerMemberName('  ', 'tank')).toBe('Warder');
  });
});

describe('pluralize', () => {
  it('regular and irregular nouns', () => {
    const cases: [string, string][] = [
      ['skitterer', 'skitterers'],
      ['wolf', 'wolves'],
      ['man', 'men'],
      ['woman', 'women'],
      ['mouse', 'mice'],
      ['louse', 'lice'],
      ['child', 'children'],
      ['foot', 'feet'],
      ['tooth', 'teeth'],
      ['goose', 'geese'],
      ['elf', 'elves'],
      ['dwarf', 'dwarves'],
      ['thief', 'thieves'],
      ['fly', 'flies'],
      ['ash', 'ashes'],
      ['box', 'boxes'],
      ['witch', 'witches'],
      ['moss', 'mosses'],
      ['sheep', 'sheep'],
      ['deer', 'deer'],
      ['fish', 'fish'],
      ['wraith', 'wraiths'],
      ['monkey', 'monkeys'],
      ['werewolf', 'werewolves'],
      ['swordsman', 'swordsmen'],
      ['human', 'humans'],
      ['shaman', 'shamans'],
      ['Wolf', 'Wolves'],
      ['Skitterer', 'Skitterers'],
      ['', ''],
    ];
    for (const [singular, plural] of cases) expect(pluralize(singular)).toBe(plural);
  });
});

describe('nounsFromTemplateName', () => {
  it('builds the family name and the lowercase nouns', () => {
    expect(nounsFromTemplateName('Salt-Crust Skitterer')).toEqual({
      familyName: 'Salt-Crust Skitterers',
      singular: 'skitterer',
      plural: 'skitterers',
    });
    expect(nounsFromTemplateName('Grey Wolf')).toEqual({ familyName: 'Grey Wolves', singular: 'wolf', plural: 'wolves' });
    expect(nounsFromTemplateName('  Goblin  ')).toEqual({ familyName: 'Goblins', singular: 'goblin', plural: 'goblins' });
  });
});

describe('defaults by creature type and material kind', () => {
  it('temperament', () => {
    for (const type of ['beast', 'undead', 'elemental']) expect(temperamentForCreatureType(type)).toBe('aggressive');
    for (const type of ['humanoid', 'construct', 'aberration']) expect(temperamentForCreatureType(type)).toBe('wary');
    expect(temperamentForCreatureType('mystery')).toBe('wary');
    expect(temperamentForCreatureType(' Beast ')).toBe('aggressive');
  });

  it('family icon key', () => {
    expect(iconKeyForCreatureType('beast')).toBe('beast');
    expect(iconKeyForCreatureType('undead')).toBe('undead');
    expect(iconKeyForCreatureType('humanoid')).toBe('humanoid');
    expect(iconKeyForCreatureType('elemental')).toBe('elemental');
    expect(iconKeyForCreatureType('aberration')).toBe('spirit');
    expect(iconKeyForCreatureType('construct')).toBe('');
    expect(iconKeyForCreatureType('mystery')).toBe('');
    for (const type of ['beast', 'undead', 'humanoid', 'elemental', 'aberration']) {
      expect((FAMILY_ICON_KEYS as readonly string[]).includes(iconKeyForCreatureType(type))).toBe(true);
    }
  });

  it('resource icon key', () => {
    const cases: [string, string][] = [
      ['metal', 'mineral'],
      ['trinket', 'gem'],
      ['wood', 'wood'],
      ['cloth', 'fibre'],
      ['hide', 'fibre'],
      ['edible', 'herb'],
      ['base', 'fluid'],
      ['mystery', 'mineral'],
      ['', 'mineral'],
    ];
    for (const [kind, key] of cases) {
      expect(resourceIconKey(kind)).toBe(key);
      expect((RESOURCE_ICON_KEYS as readonly string[]).includes(resourceIconKey(kind))).toBe(true);
    }
  });
});

describe('family keys', () => {
  it('region family and quest family', () => {
    expect(familyKey(7n, 'beast')).toBe('7:beast');
    expect(questFamilyKey(42n)).toBe('quest:42');
  });
});

// ============================================================================
// Plan 28: the rule family list and the rule history line (D-66, D-68, D-70; PROPOSED copy, D-58)
// ============================================================================

describe('RULE_FAMILY_BANK (D-66, PROPOSED)', () => {
  it('holds the twelve rule families, frozen, with unique plain names', () => {
    expect(RULE_FAMILY_BANK).toHaveLength(12);
    expect(Object.isFrozen(RULE_FAMILY_BANK)).toBe(true);
    for (const entry of RULE_FAMILY_BANK) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(entry.name).toMatch(/^[A-Za-z]+( [A-Za-z]+){0,2}$/);
    }
    expect(new Set(RULE_FAMILY_BANK.map((e) => e.name.toLowerCase())).size).toBe(12);
    expect(RULE_FAMILY_BANK.map((e) => e.name)).toEqual([
      'Ridge Wolves', 'Thornback Boars', 'Mire Crawlers', 'Barrow Wights', 'Cave Shriekers', 'Rubble Golems',
      'Ember Wisps', 'Roadside Brigands', 'Shore Harriers', 'Reef Snappers', 'Grave Hounds', 'Crag Lurkers',
    ]);
  });

  it('keeps nouns, verbs and enums inside the rules', () => {
    for (const entry of RULE_FAMILY_BANK) {
      expect(entry.pluralNoun).toBe(pluralize(entry.singularNoun));
      expect(ambushVerbForms(entry.ambushVerb, '').one).toBe(entry.ambushVerb + 's');
      expect(['beast', 'undead', 'humanoid', 'elemental', 'construct', 'aberration']).toContain(entry.creatureType);
      expect(FAMILY_ICON_KEYS).toContain(entry.iconKey);
      expect(FAMILY_TEMPERAMENTS).toContain(entry.temperament);
      expect(entry.ambushRest).toMatch(/^[a-z]+( [a-z]+){1,5}$/);
      expect(entry.fitTerrains.length).toBeGreaterThan(0);
      for (const terrain of entry.fitTerrains) expect(Object.keys(PLACE_NOUN_BY_TERRAIN)).toContain(terrain);
    }
  });

  it('covers every wild terrain with at least two families', () => {
    for (const terrain of ['mountains', 'woods', 'plains', 'swamp', 'dungeon', 'coastal']) {
      expect(RULE_FAMILY_BANK.filter((e) => e.fitTerrains.includes(terrain)).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('ruleFamilyHistory (D-68, D-70, PROPOSED)', () => {
  it('gives the base line', () => {
    expect(ruleFamilyHistory({ familyName: 'Ridge Wolves', regionName: 'Kesterlane Basin' })).toBe(
      'The Ridge Wolves have roamed Kesterlane Basin for longer than any traveler remembers.',
    );
    expect(ruleFamilyHistory({ familyName: 'Ridge Wolves', regionName: 'Kesterlane Basin', feudNames: [] })).toBe(
      'The Ridge Wolves have roamed Kesterlane Basin for longer than any traveler remembers.',
    );
  });

  it('names the feud', () => {
    expect(ruleFamilyHistory({ familyName: 'Ridge Wolves', regionName: 'Kesterlane Basin', feudNames: ['Grave Hounds'] })).toBe(
      'The Ridge Wolves have roamed Kesterlane Basin for longer than any traveler remembers.' +
        ' No truce has ever held between the Ridge Wolves and the Grave Hounds.',
    );
    expect(
      ruleFamilyHistory({ familyName: 'Ridge Wolves', regionName: 'Kesterlane Basin', feudNames: ['Grave Hounds', 'Crag Lurkers'] }),
    ).toMatch(/ No truce has ever held between the Ridge Wolves, the Grave Hounds and the Crag Lurkers\.$/);
  });

  it('never doubles a leading The', () => {
    const line = ruleFamilyHistory({ familyName: 'The Hollow Kin', regionName: 'Kesterlane Basin', feudNames: ['the Grave Hounds'] });
    expect(line).toBe(
      'The Hollow Kin have roamed Kesterlane Basin for longer than any traveler remembers.' +
        ' No truce has ever held between the Hollow Kin and the Grave Hounds.',
    );
    expect(line).not.toMatch(/the the/i);
  });

  it('has no digit, no pronoun, no Keeper and no banned word', () => {
    for (const entry of RULE_FAMILY_BANK) {
      const line = ruleFamilyHistory({ familyName: entry.name, regionName: 'Kesterlane Basin', feudNames: ['Grave Hounds', 'Crag Lurkers'] });
      expect(line).not.toMatch(/\d/);
      expect(line).not.toMatch(/\b(they|them|their|its)\b/i);
      expect(line).not.toMatch(/Keeper/);
      expect(line).not.toMatch(new RegExp('rip' + 'ple', 'i'));
    }
  });
});
