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
  CLASS_SCHEMA,
  REGION_GENERATION_SCHEMA,
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
  ['CLASS_SCHEMA', CLASS_SCHEMA],
  ['REGION_GENERATION_SCHEMA', REGION_GENERATION_SCHEMA],
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
    expect(countUnionParams(CLASS_SCHEMA)).toBe(3);
    expect(countUnionParams(SKILL_GENERATION_SCHEMA)).toBe(4);
    expect(countUnionParams(RENOWN_PERK_SCHEMA)).toBe(6);
    expect(countUnionParams(REGION_GENERATION_SCHEMA)).toBe(0);
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
    const ability = (CLASS_SCHEMA as any).properties.abilities.items;
    expect(Object.isFrozen(ability)).toBe(true);
    expect(Object.isFrozen(ability.properties.effectType.anyOf)).toBe(true);
    expect(Object.isFrozen((SKILL_GENERATION_SCHEMA as any).properties.skills.items.required)).toBe(true);
  });

  it('LLM_JSON_SCHEMAS references the same frozen objects', () => {
    expect(LLM_JSON_SCHEMAS.race).toBe(RACE_SCHEMA);
    expect(LLM_JSON_SCHEMAS.class).toBe(CLASS_SCHEMA);
    expect(LLM_JSON_SCHEMAS.region).toBe(REGION_GENERATION_SCHEMA);
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
    expect(sorted(enumAt(CLASS_SCHEMA, ...stats, 'primaryStat'))).toEqual(sorted(STAT_TYPES));
    expect(sorted(enumAt(CLASS_SCHEMA, ...stats, 'secondaryStat'))).toEqual(sorted([...STAT_TYPES, 'none']));
    expect(sorted(enumAt(CLASS_SCHEMA, ...stats, 'weaponProficiencies'))).toEqual(sorted(WEAPON_TYPES));
    expect(sorted(enumAt(CLASS_SCHEMA, ...stats, 'armorProficiencies'))).toEqual(
      sorted(ARMOR_TYPES.filter((a) => a !== 'shield')),
    );
    const ab = ['abilities', '[]'];
    expect(sorted(enumAt(CLASS_SCHEMA, ...ab, 'kind'))).toEqual(sorted(ABILITY_KINDS));
    expect(sorted(enumAt(CLASS_SCHEMA, ...ab, 'damageType'))).toEqual(sorted(DAMAGE_TYPES));
    expect(sorted(enumAt(CLASS_SCHEMA, ...ab, 'scaling'))).toEqual(sorted(STAT_TYPES));
    subset(enumAt(CLASS_SCHEMA, ...ab, 'targetRule'), TARGET_RULES);
    subset(enumAt(CLASS_SCHEMA, ...ab, 'resourceType'), RESOURCE_TYPES);
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
    for (const schema of [RACE_SCHEMA, CLASS_SCHEMA, SKILL_GENERATION_SCHEMA, RENOWN_PERK_SCHEMA]) {
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

describe('region npc gender (Plan 41-18, PR-02)', () => {
  const item = (REGION_GENERATION_SCHEMA as any).properties.npcs.items;

  it('requires a male/female gender enum right after name', () => {
    expect(item.properties.gender).toEqual({ type: 'string', enum: ['male', 'female'] });
    expect(item.required[0]).toBe('name');
    expect(item.required[1]).toBe('gender');
  });

  it('still lints clean with no optional or union parameters', () => {
    expect(lintSchema(REGION_GENERATION_SCHEMA)).toEqual([]);
    expect(countOptionalParams(REGION_GENERATION_SCHEMA)).toBe(0);
    expect(countUnionParams(REGION_GENERATION_SCHEMA)).toBe(0);
  });

  it('RACE_SCHEMA raceName speaks of the player, not a singular they', () => {
    const d: string = (RACE_SCHEMA as any).properties.raceName.description;
    expect(d).toContain('If the player said');
    expect(d).not.toContain('If they said');
  });
});
