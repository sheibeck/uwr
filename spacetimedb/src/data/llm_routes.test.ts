import { describe, it, expect } from 'vitest';
import { CLAUDE_MODEL, ANTHROPIC_MAX_TIMEOUT_MS, ANTHROPIC_VERSION, ANTHROPIC_MESSAGES_URL } from './llm_models';
import { LLM_ROUTE_NAMES, LLM_ROUTES, validateRoutes, isLlmRoute, type LlmRoute } from './llm_routes';
import {
  RACE_SCHEMA,
  CLASS_SCHEMA,
  REGION_GENERATION_SCHEMA,
  SKILL_GENERATION_SCHEMA,
  RENOWN_PERK_SCHEMA,
} from './llm_schemas';
import { lintSchema } from '../helpers/schema_lint';

const LOCKED_MAX_TOKENS: Record<LlmRoute, number> = {
  world_gen: 8192,
  creation_race: 4096,
  creation_class: 4096,
  skill_gen: 4096,
  renown_perk_gen: 2048,
  npc_conversation: 1024,
  combat_narration: 1024,
  smoke_test: 256,
};

const JSON_SCHEMAS: Partial<Record<LlmRoute, object>> = {
  creation_race: RACE_SCHEMA,
  creation_class: CLASS_SCHEMA,
  world_gen: REGION_GENERATION_SCHEMA,
  skill_gen: SKILL_GENERATION_SCHEMA,
  renown_perk_gen: RENOWN_PERK_SCHEMA,
};

/** Mutable deep clone of the real table (the real one is frozen). */
const clone = (): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(LLM_ROUTES)) out[k] = { ...v, cache: { ...v.cache }, output: { ...v.output } };
  return out;
};

describe('llm_models', () => {
  it('pins the model, version, url and platform timeout', () => {
    expect(CLAUDE_MODEL).toBe('claude-sonnet-5-5');
    expect(ANTHROPIC_VERSION).toBe('2023-06-01');
    expect(ANTHROPIC_MESSAGES_URL).toBe('https://api.anthropic.com/v1/messages');
    expect(ANTHROPIC_MAX_TIMEOUT_MS).toBe(180_000);
  });
});

describe('LLM_ROUTES', () => {
  it('has eight unique route names matching the table keys', () => {
    expect(LLM_ROUTE_NAMES).toHaveLength(8);
    expect(new Set(LLM_ROUTE_NAMES).size).toBe(8);
    expect(Object.keys(LLM_ROUTES).sort()).toEqual([...LLM_ROUTE_NAMES].sort());
  });

  it('uses the locked max_tokens per route', () => {
    const actual = Object.fromEntries(LLM_ROUTE_NAMES.map((r) => [r, LLM_ROUTES[r].maxTokens]));
    expect(actual).toEqual(LOCKED_MAX_TOKENS);
  });

  it.each([...LLM_ROUTE_NAMES])('%s: model, effort, timeout and cache flags', (name) => {
    const cfg = LLM_ROUTES[name];
    expect(cfg.model).toBe(CLAUDE_MODEL);
    expect(cfg.effort).toBe('low');
    expect(cfg.timeoutMs).toBeGreaterThan(0);
    expect(cfg.timeoutMs).toBeLessThanOrEqual(ANTHROPIC_MAX_TIMEOUT_MS);
    expect(cfg.cache).toEqual({ bible: true, route: true });
  });

  it('json routes carry their schema by identity; text routes carry none', () => {
    for (const name of LLM_ROUTE_NAMES) {
      const out = LLM_ROUTES[name].output;
      const schema = JSON_SCHEMAS[name];
      if (schema) {
        expect(out.kind).toBe('json');
        expect((out as { schema: object }).schema).toBe(schema);
      } else {
        expect(out).toEqual({ kind: 'text' });
      }
    }
    expect(['npc_conversation', 'combat_narration', 'smoke_test'].map((r) => LLM_ROUTES[r as LlmRoute].output.kind)).toEqual([
      'text',
      'text',
      'text',
    ]);
  });

  it('every json route schema passes lintSchema', () => {
    for (const name of LLM_ROUTE_NAMES) {
      const out = LLM_ROUTES[name].output;
      if (out.kind === 'json') expect(lintSchema(out.schema)).toEqual([]);
    }
  });

  it('is deeply frozen', () => {
    expect(Object.isFrozen(LLM_ROUTES)).toBe(true);
    expect(Object.isFrozen(LLM_ROUTES.world_gen)).toBe(true);
    expect(Object.isFrozen(LLM_ROUTES.world_gen.cache)).toBe(true);
  });

  it('is valid', () => {
    expect(validateRoutes(LLM_ROUTES)).toEqual([]);
  });
});

describe('validateRoutes', () => {
  it('accepts a timeout of exactly 180000 and rejects 180001', () => {
    const ok = clone();
    ok.world_gen.timeoutMs = 180_000;
    expect(validateRoutes(ok)).toEqual([]);
    const bad = clone();
    bad.world_gen.timeoutMs = 180_001;
    const problems = validateRoutes(bad);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/world_gen: timeoutMs 180001/);
  });

  it('reports every route missing on an empty table', () => {
    const problems = validateRoutes({});
    expect(problems).toHaveLength(8);
    for (const name of LLM_ROUTE_NAMES) expect(problems).toContain(`${name}: missing route`);
  });

  it('reports an unknown extra route', () => {
    const t = clone();
    t.gpt = t.smoke_test;
    expect(validateRoutes(t)).toEqual(['gpt: unknown route']);
  });

  it('reports a missing effort', () => {
    const t = clone();
    delete t.skill_gen.effort;
    expect(validateRoutes(t).join('\n')).toMatch(/skill_gen: effort/);
  });

  it('reports an invalid effort value', () => {
    const t = clone();
    t.skill_gen.effort = 'max';
    expect(validateRoutes(t).join('\n')).toMatch(/skill_gen: effort/);
  });

  it.each([0, -1, 1.5])('reports maxTokens %s', (n) => {
    const t = clone();
    t.smoke_test.maxTokens = n;
    expect(validateRoutes(t).join('\n')).toMatch(/smoke_test: maxTokens/);
  });

  it('reports a wrong model', () => {
    const t = clone();
    t.smoke_test.model = 'other-model';
    expect(validateRoutes(t).join('\n')).toMatch(/smoke_test: model/);
  });

  it('reports a json output without a schema and a text output with one', () => {
    const a = clone();
    a.world_gen.output = { kind: 'json' };
    expect(validateRoutes(a).join('\n')).toMatch(/world_gen: json output requires a schema/);
    const b = clone();
    b.smoke_test.output = { kind: 'text', schema: {} };
    expect(validateRoutes(b).join('\n')).toMatch(/smoke_test: text output must not carry a schema/);
  });

  it('reports a cache flag that is not true', () => {
    const t = clone();
    t.world_gen.cache.bible = false;
    expect(validateRoutes(t).join('\n')).toMatch(/world_gen: cache/);
  });
});

describe('isLlmRoute', () => {
  it('accepts route names and rejects everything else', () => {
    expect(isLlmRoute('world_gen')).toBe(true);
    expect(isLlmRoute('gpt')).toBe(false);
    expect(isLlmRoute(undefined)).toBe(false);
    expect(isLlmRoute(3)).toBe(false);
  });
});
