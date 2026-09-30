import { describe, it, expect } from 'vitest';
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
// Legacy builder, imported ONLY for the equivalence test below. It exports no schema
// identifier that clashes with llm_schemas (the clashing names are string constants there).
import { buildSkillGenResponseFormat } from './llm_prompts';

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
// Legacy equivalence (Phase 41 deletes this test together with the legacy builder)
// ----------------------------------------------------------------------------

/**
 * Normalize a schema for comparison: drop string `description` annotations, rewrite
 * array-valued `type` that lists 'null' as an anyOf of the single types, sort enums.
 * A property NAMED description has an object value and is kept.
 */
function normalize(node: any): any {
  if (Array.isArray(node)) return node.map(normalize);
  if (node && typeof node === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === 'description' && typeof v === 'string') continue;
      if (k === 'enum' && Array.isArray(v)) {
        out[k] = [...v].sort();
        continue;
      }
      out[k] = normalize(v);
    }
    if (Array.isArray(out.type)) {
      const { type, ...rest } = out;
      return { anyOf: (type as string[]).map((ty) => (ty === 'null' ? { type: 'null' } : { type: ty, ...rest })) };
    }
    return out;
  }
  return node;
}

describe('legacy skill schema equivalence', () => {
  it('SKILL_GENERATION_SCHEMA equals the mapped buildSkillGenResponseFormat() schema', () => {
    const legacy = (buildSkillGenResponseFormat() as any).json_schema.schema;
    expect(normalize(SKILL_GENERATION_SCHEMA)).toEqual(normalize(legacy));
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
