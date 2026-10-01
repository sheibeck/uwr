import { describe, it, expect } from 'vitest';
// The tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
// @ts-ignore
import { join, relative, sep } from 'node:path';
// @ts-ignore
import { fileURLToPath } from 'node:url';
import {
  RACE_SCHEMA,
  CLASS_REVEAL_SCHEMA,
  CLASS_FILL_SCHEMA,
  WORLD_START_SCHEMA,
  REGION_FILL_SCHEMA,
  SKILL_GENERATION_SCHEMA,
  RENOWN_PERK_SCHEMA,
  LLM_JSON_SCHEMAS,
  deepFreeze,
} from './llm_schemas';
import { lintSchema, countOptionalParams, countUnionParams } from '../helpers/schema_lint';
import {
  STAT_TYPES,
  ABILITY_KINDS,
  RESOURCE_TYPES,
  DAMAGE_TYPES,
  SCALING_TYPES,
  TARGET_RULES,
  ARMOR_TYPES,
  WEAPON_TYPES,
} from './mechanical_vocabulary';

const ALL: Array<[string, any]> = [
  ['RACE_SCHEMA', RACE_SCHEMA],
  ['CLASS_REVEAL_SCHEMA', CLASS_REVEAL_SCHEMA],
  ['CLASS_FILL_SCHEMA', CLASS_FILL_SCHEMA],
  ['WORLD_START_SCHEMA', WORLD_START_SCHEMA],
  ['REGION_FILL_SCHEMA', REGION_FILL_SCHEMA],
  ['SKILL_GENERATION_SCHEMA', SKILL_GENERATION_SCHEMA],
  ['RENOWN_PERK_SCHEMA', RENOWN_PERK_SCHEMA],
];

const sorted = (xs: readonly string[]) => [...xs].sort();
const enumAt = (schema: any, ...path: string[]): string[] => {
  let node = schema;
  for (const key of path) node = key === '[]' ? node.items : node.properties[key];
  return node.enum ?? node.items.enum;
};

describe('lint and determinism', () => {
  it.each(ALL)('%s passes lintSchema with zero problems', (_name, schema) => {
    expect(lintSchema(schema)).toEqual([]);
  });

  it('parameter counts per schema', () => {
    expect(countUnionParams(RACE_SCHEMA)).toBe(0);
    expect(countUnionParams(CLASS_REVEAL_SCHEMA)).toBe(3);
    expect(countUnionParams(CLASS_FILL_SCHEMA)).toBe(3);
    expect(countUnionParams(SKILL_GENERATION_SCHEMA)).toBe(4);
    expect(countUnionParams(RENOWN_PERK_SCHEMA)).toBe(6);
    expect(countUnionParams(WORLD_START_SCHEMA)).toBe(0);
    expect(countUnionParams(REGION_FILL_SCHEMA)).toBe(0);
    for (const [, schema] of ALL) expect(countOptionalParams(schema)).toBe(0);
  });

  it.each(ALL)('%s serialization is deterministic and matches the snapshot', (_name, schema) => {
    const a = JSON.stringify(schema);
    const b = JSON.stringify(schema);
    expect(a).toBe(b);
    expect(JSON.stringify(schema, null, 2)).toMatchSnapshot();
  });

  it.each(ALL)('%s is deeply frozen', (_name, schema) => {
    expect(Object.isFrozen(schema)).toBe(true);
    expect(Object.isFrozen(schema.properties)).toBe(true);
    expect(Object.isFrozen(schema.required)).toBe(true);
  });

  it('spot-checks frozen nested nodes', () => {
    const ability = (CLASS_FILL_SCHEMA as any).properties.abilities.items;
    expect(Object.isFrozen(ability)).toBe(true);
    expect(Object.isFrozen(ability.properties.effectType.anyOf)).toBe(true);
    const first = (CLASS_REVEAL_SCHEMA as any).properties.firstAbility;
    expect(Object.isFrozen(first.properties.effectType.anyOf)).toBe(true);
    expect(Object.isFrozen((WORLD_START_SCHEMA as any).properties.firstNpc.properties.personality.required)).toBe(true);
    expect(Object.isFrozen((SKILL_GENERATION_SCHEMA as any).properties.skills.items.required)).toBe(true);
  });

  it('LLM_JSON_SCHEMAS references the same frozen objects', () => {
    expect(LLM_JSON_SCHEMAS.race).toBe(RACE_SCHEMA);
    expect(LLM_JSON_SCHEMAS.classReveal).toBe(CLASS_REVEAL_SCHEMA);
    expect(LLM_JSON_SCHEMAS.classFill).toBe(CLASS_FILL_SCHEMA);
    expect(LLM_JSON_SCHEMAS.worldStart).toBe(WORLD_START_SCHEMA);
    expect(LLM_JSON_SCHEMAS.regionFill).toBe(REGION_FILL_SCHEMA);
    expect(Object.keys(LLM_JSON_SCHEMAS).sort()).toEqual([
      'classFill',
      'classReveal',
      'race',
      'regionFill',
      'renown',
      'skill',
      'worldStart',
    ]);
    expect(LLM_JSON_SCHEMAS.skill).toBe(SKILL_GENERATION_SCHEMA);
    expect(LLM_JSON_SCHEMAS.renown).toBe(RENOWN_PERK_SCHEMA);
    expect(Object.isFrozen(LLM_JSON_SCHEMAS)).toBe(true);
  });

  it('deepFreeze freezes nested arrays and objects and returns the same reference', () => {
    const input = { a: [{ b: 1 }], c: { d: [1, 2] } };
    const out = deepFreeze(input);
    expect(out).toBe(input);
    expect(Object.isFrozen(input.a[0])).toBe(true);
    expect(Object.isFrozen(input.c.d)).toBe(true);
  });
});

describe('enums are subsets of the mechanical vocabulary', () => {
  const subset = (actual: readonly string[], allowed: readonly string[]) => {
    for (const v of actual) expect(allowed).toContain(v);
  };

  it('race stat enums equal STAT_TYPES', () => {
    for (const which of ['primary', 'secondary']) {
      const stat = (RACE_SCHEMA as any).properties.bonuses.properties[which].properties.stat;
      expect(sorted(stat.enum)).toEqual(sorted(STAT_TYPES));
    }
  });

  it('class enums come from the vocabulary', () => {
    const stats = ['stats'];
    expect(sorted(enumAt(CLASS_FILL_SCHEMA, ...stats, 'primaryStat'))).toEqual(sorted(STAT_TYPES));
    expect(sorted(enumAt(CLASS_FILL_SCHEMA, ...stats, 'secondaryStat'))).toEqual(sorted([...STAT_TYPES, 'none']));
    expect(sorted(enumAt(CLASS_FILL_SCHEMA, ...stats, 'weaponProficiencies'))).toEqual(sorted(WEAPON_TYPES));
    expect(sorted(enumAt(CLASS_FILL_SCHEMA, ...stats, 'armorProficiencies'))).toEqual(
      sorted(ARMOR_TYPES.filter((a) => a !== 'shield')),
    );
    const fillAb = ['abilities', '[]'];
    const revealAb = ['firstAbility'];
    for (const [schema, ab] of [
      [CLASS_FILL_SCHEMA, fillAb],
      [CLASS_REVEAL_SCHEMA, revealAb],
    ] as Array<[any, string[]]>) {
      expect(sorted(enumAt(schema, ...ab, 'kind'))).toEqual(sorted(ABILITY_KINDS));
      expect(sorted(enumAt(schema, ...ab, 'damageType'))).toEqual(sorted(DAMAGE_TYPES));
      expect(sorted(enumAt(schema, ...ab, 'scaling'))).toEqual(sorted(STAT_TYPES));
      subset(enumAt(schema, ...ab, 'targetRule'), TARGET_RULES);
      subset(enumAt(schema, ...ab, 'resourceType'), RESOURCE_TYPES);
    }
  });

  it('skill enums come from the vocabulary', () => {
    const sk = ['skills', '[]'];
    expect(sorted(enumAt(SKILL_GENERATION_SCHEMA, ...sk, 'kind'))).toEqual(sorted(ABILITY_KINDS));
    expect(sorted(enumAt(SKILL_GENERATION_SCHEMA, ...sk, 'targetRule'))).toEqual(
      sorted(TARGET_RULES.filter((r) => r !== 'corpse')),
    );
    expect(sorted(enumAt(SKILL_GENERATION_SCHEMA, ...sk, 'resourceType'))).toEqual(sorted(RESOURCE_TYPES));
    expect(sorted(enumAt(SKILL_GENERATION_SCHEMA, ...sk, 'scaling'))).toEqual(sorted(SCALING_TYPES));
    expect(sorted(enumAt(SKILL_GENERATION_SCHEMA, ...sk, 'damageType'))).toEqual(sorted(DAMAGE_TYPES));
  });

  it('renown enums come from the vocabulary', () => {
    const pk = ['perks', '[]'];
    expect(sorted(enumAt(RENOWN_PERK_SCHEMA, ...pk, 'kind'))).toEqual(sorted(['', ...ABILITY_KINDS]));
    subset(enumAt(RENOWN_PERK_SCHEMA, ...pk, 'targetRule'), TARGET_RULES);
    expect(sorted(enumAt(RENOWN_PERK_SCHEMA, ...pk, 'resourceType'))).toEqual(sorted(RESOURCE_TYPES));
    expect(sorted(enumAt(RENOWN_PERK_SCHEMA, ...pk, 'scaling'))).toEqual(sorted(SCALING_TYPES));
    const damage = (RENOWN_PERK_SCHEMA as any).properties.perks.items.properties.damageType;
    expect(sorted(damage.anyOf[0].enum)).toEqual(sorted(DAMAGE_TYPES));
    expect(damage.anyOf[1]).toEqual({ type: 'null' });
  });

  it('race, class, skill and renown schemas contain no non-vocabulary values (holy, lightning, stun)', () => {
    for (const schema of [RACE_SCHEMA, CLASS_REVEAL_SCHEMA, CLASS_FILL_SCHEMA, SKILL_GENERATION_SCHEMA, RENOWN_PERK_SCHEMA]) {
      const enums: string[] = [];
      const walk = (n: any) => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (n && typeof n === 'object') {
          if (Array.isArray(n.enum)) enums.push(...n.enum);
          Object.values(n).forEach(walk);
        }
      };
      walk(schema);
      for (const bad of ['holy', 'lightning', 'stun']) expect(enums).not.toContain(bad);
    }
  });
});

// ----------------------------------------------------------------------------
// The v2.0 prompt builders are gone and stay gone
// ----------------------------------------------------------------------------

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // spacetimedb/src/data -> repo root
const PROMPT_MODULE_SCAN_ROOTS = ['spacetimedb/src', 'src'];
const PROMPT_MODULE_EXCLUDED_DIRS = new Set(['node_modules', 'module_bindings', 'dist']);

function sourceFiles(dir: string, out: string[]): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return; // a scan root that does not exist is simply empty
  }
  for (const name of names) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!PROMPT_MODULE_EXCLUDED_DIRS.has(name)) sourceFiles(full, out);
    } else if (name.endsWith('.ts') || name.endsWith('.vue')) {
      out.push(full);
    }
  }
}

describe('removed v2.0 prompt builders', () => {
  it('the legacy prompt module no longer exists', () => {
    expect(existsSync(join(REPO_ROOT, 'spacetimedb/src/data/llm_prompts.ts'))).toBe(false);
  });

  it('no source file imports the legacy prompt module', () => {
    const files: string[] = [];
    for (const root of PROMPT_MODULE_SCAN_ROOTS) sourceFiles(join(REPO_ROOT, root), files);
    expect(files.length).toBeGreaterThan(50); // the scan really walked the tree
    const importsLegacy = /(?:from\s+|import\s*\(\s*)['"][^'"]*llm_prompts['"]/;
    const offenders = files
      .filter((f) => importsLegacy.test(readFileSync(f, 'utf8')))
      .map((f) => relative(REPO_ROOT, f).split(sep).join('/'));
    expect(offenders).toEqual([]);
  });
});

describe('staged generation schemas (Plan 43-04)', () => {
  const props = (schema: any) => Object.keys(schema.properties);

  it('WORLD_START_SCHEMA requires exactly the five reveal fields', () => {
    expect((WORLD_START_SCHEMA as any).required).toEqual([
      'regionName',
      'regionDescription',
      'biome',
      'startLocation',
      'firstNpc',
    ]);
    expect((WORLD_START_SCHEMA as any).additionalProperties).toBe(false);
  });

  it('WORLD_START_SCHEMA is the smallest reveal: no landmarks, threats, enemies, extra locations or isSafe', () => {
    for (const key of ['landmarks', 'threats', 'enemies', 'locations', 'npcs', 'dominantFaction']) {
      expect(props(WORLD_START_SCHEMA)).not.toContain(key);
    }
    const loc = (WORLD_START_SCHEMA as any).properties.startLocation;
    expect(loc.required).toEqual(['name', 'description', 'terrainType', 'levelOffset']);
    expect(loc.properties.terrainType.enum).toEqual(['mountains', 'woods', 'plains', 'swamp', 'dungeon', 'town', 'city']);
    expect(props(loc)).not.toContain('isSafe');
    expect(props(loc)).not.toContain('connectsTo');
  });

  it('firstNpc keeps the male/female gender enum right after name and has no locationName', () => {
    const npc = (WORLD_START_SCHEMA as any).properties.firstNpc;
    expect(npc.properties.gender).toEqual({ type: 'string', enum: ['male', 'female'] });
    expect(npc.required[0]).toBe('name');
    expect(npc.required[1]).toBe('gender');
    expect(props(npc)).not.toContain('locationName');
    expect(npc.required).toEqual(['name', 'gender', 'npcType', 'description', 'greeting', 'personality']);
    expect(npc.properties.personality.required).toEqual([
      'traits',
      'speechPattern',
      'knowledgeDomains',
      'secrets',
      'affinityMultiplier',
    ]);
  });

  it('biome enum is the existing ten values on the start schema', () => {
    expect((WORLD_START_SCHEMA as any).properties.biome.enum).toEqual([
      'volcanic',
      'forest',
      'tundra',
      'desert',
      'swamp',
      'mountains',
      'plains',
      'coastal',
      'cavern',
      'ruins',
    ]);
  });

  it('REGION_FILL_SCHEMA has no regionName, regionDescription or biome and requires NPC gender', () => {
    expect((REGION_FILL_SCHEMA as any).required).toEqual([
      'dominantFaction',
      'landmarks',
      'threats',
      'locations',
      'npcs',
      'enemies',
    ]);
    for (const key of ['regionName', 'regionDescription', 'biome']) {
      expect(props(REGION_FILL_SCHEMA)).not.toContain(key);
    }
    const item = (REGION_FILL_SCHEMA as any).properties.npcs.items;
    expect(item.properties.gender).toEqual({ type: 'string', enum: ['male', 'female'] });
    expect(item.required[0]).toBe('name');
    expect(item.required[1]).toBe('gender');
    expect(item.required).toContain('locationName');
    const loc = (REGION_FILL_SCHEMA as any).properties.locations.items;
    expect(loc.required).toEqual(['name', 'description', 'terrainType', 'isSafe', 'levelOffset', 'connectsTo']);
  });

  it('CLASS_REVEAL_SCHEMA carries no stats and exactly one ability object', () => {
    expect((CLASS_REVEAL_SCHEMA as any).required).toEqual(['className', 'classDescription', 'firstAbility']);
    expect(props(CLASS_REVEAL_SCHEMA)).not.toContain('stats');
    expect(props(CLASS_REVEAL_SCHEMA)).not.toContain('abilities');
    expect((CLASS_REVEAL_SCHEMA as any).properties.firstAbility.type).toBe('object');
  });

  it('CLASS_FILL_SCHEMA has stats and an abilities array of the same ability item', () => {
    expect((CLASS_FILL_SCHEMA as any).required).toEqual(['stats', 'abilities']);
    const abilities = (CLASS_FILL_SCHEMA as any).properties.abilities;
    expect(abilities.type).toBe('array');
    expect(abilities.description).toContain('Exactly 2');
    expect(abilities.items).toEqual((CLASS_REVEAL_SCHEMA as any).properties.firstAbility);
  });

  it('the old one-shot schemas are gone', () => {
    const src = readFileSync(join(REPO_ROOT, 'spacetimedb/src/data/llm_schemas.ts'), 'utf8');
    expect(src).not.toContain('REGION_GENERATION' + '_SCHEMA');
    expect(src).not.toMatch(/export const CLASS_SCHEMA/);
  });
});

describe('region npc gender (Plan 41-18, PR-02)', () => {
  const item = (REGION_FILL_SCHEMA as any).properties.npcs.items;

  it('requires a male/female gender enum right after name', () => {
    expect(item.properties.gender).toEqual({ type: 'string', enum: ['male', 'female'] });
    expect(item.required[0]).toBe('name');
    expect(item.required[1]).toBe('gender');
  });

  it('still lints clean with no optional or union parameters', () => {
    for (const schema of [REGION_FILL_SCHEMA, WORLD_START_SCHEMA]) {
      expect(lintSchema(schema)).toEqual([]);
      expect(countOptionalParams(schema)).toBe(0);
      expect(countUnionParams(schema)).toBe(0);
    }
  });

  it('RACE_SCHEMA raceName speaks of the player, not a singular they', () => {
    const d: string = (RACE_SCHEMA as any).properties.raceName.description;
    expect(d).toContain('If the player said');
    expect(d).not.toContain('If they said');
  });
});
