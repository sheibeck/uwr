import { describe, it, expect } from 'vitest';
import { CLAUDE_MODEL, ANTHROPIC_MAX_TIMEOUT_MS, ANTHROPIC_VERSION, ANTHROPIC_MESSAGES_URL } from './llm_models';
import { LLM_ROUTE_NAMES, LLM_ROUTES, validateRoutes, isLlmRoute, type LlmRoute } from './llm_routes';
import { LLM_TUNING, LLM_ROUTE_BASELINES } from './llm_tuning';
import {
  RACE_SCHEMA,
  CLASS_REVEAL_SCHEMA,
  CLASS_FILL_SCHEMA,
  WORLD_START_SCHEMA,
  REGION_FILL_SCHEMA,
  SKILL_GENERATION_SCHEMA,
  RENOWN_PERK_SCHEMA,
  COMBAT_NARRATION_SCHEMA,
} from './llm_schemas';
import { lintSchema } from '../helpers/schema_lint';

// Phase 43 tunes routes from measurements (llm_tuning.ts, traced to llm_measurements.json). The baselines
// are the Phase 40 and 43-04 values, kept for a route whose measurement is missing or too thin.
const BASELINE_MAX_TOKENS: Record<LlmRoute, number> = {
  creation_race: 4096,
  creation_class_reveal: 2048,
  creation_class: 4096,
  world_gen_start: 4096,
  world_gen: 8192,
  skill_gen: 4096,
  renown_perk_gen: 2048,
  npc_conversation: 1024,
  combat_narration: 1024,
  smoke_test: 256,
};

const JSON_SCHEMAS: Partial<Record<LlmRoute, object>> = {
  creation_race: RACE_SCHEMA,
  creation_class_reveal: CLASS_REVEAL_SCHEMA,
  creation_class: CLASS_FILL_SCHEMA,
  world_gen_start: WORLD_START_SCHEMA,
  world_gen: REGION_FILL_SCHEMA,
  skill_gen: SKILL_GENERATION_SCHEMA,
  renown_perk_gen: RENOWN_PERK_SCHEMA,
  combat_narration: COMBAT_NARRATION_SCHEMA,
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
  it('has ten unique route names in the fixed order matching the table keys', () => {
    expect([...LLM_ROUTE_NAMES]).toEqual([
      'creation_race',
      'creation_class_reveal',
      'creation_class',
      'world_gen_start',
      'world_gen',
      'skill_gen',
      'npc_conversation',
      'combat_narration',
      'renown_perk_gen',
      'smoke_test',
    ]);
    expect(LLM_ROUTE_NAMES).toHaveLength(10);
    expect(new Set(LLM_ROUTE_NAMES).size).toBe(10);
    expect(Object.keys(LLM_ROUTES).sort()).toEqual([...LLM_ROUTE_NAMES].sort());
  });

  it('reads effort, max_tokens and timeout from LLM_TUNING for every route', () => {
    for (const r of LLM_ROUTE_NAMES) {
      expect(LLM_ROUTES[r].effort).toBe(LLM_TUNING[r].effort);
      expect(LLM_ROUTES[r].maxTokens).toBe(LLM_TUNING[r].maxTokens);
      expect(LLM_ROUTES[r].timeoutMs).toBe(LLM_TUNING[r].timeoutMs);
    }
  });

  it('pins the baselines to the Phase 40 and 43-04 max_tokens', () => {
    const actual = Object.fromEntries(LLM_ROUTE_NAMES.map((r) => [r, LLM_ROUTE_BASELINES[r].maxTokens]));
    expect(actual).toEqual(BASELINE_MAX_TOKENS);
  });

  it.each([...LLM_ROUTE_NAMES])('%s: model, effort, timeout and cache flags', (name) => {
    const cfg = LLM_ROUTES[name];
    expect(cfg.model).toBe(CLAUDE_MODEL);
    expect(cfg.effort).toBe(LLM_TUNING[name].effort);
    expect(['low', 'medium']).toContain(cfg.effort);
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
    expect(['npc_conversation', 'smoke_test'].map((r) => LLM_ROUTES[r as LlmRoute].output.kind)).toEqual(['text', 'text']);
    expect(LLM_ROUTES.combat_narration.output).toEqual({ kind: 'json', schema: COMBAT_NARRATION_SCHEMA });
    expect((LLM_ROUTES.combat_narration.output as { schema: object }).schema).toBe(COMBAT_NARRATION_SCHEMA);
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

  it('stage timeouts follow the contract (timeouts stay at baseline; only effort and max_tokens are tuned)', () => {
    expect(LLM_ROUTES.creation_class_reveal.timeoutMs).toBe(60_000);
    expect(LLM_ROUTES.creation_class.timeoutMs).toBe(90_000);
    expect(LLM_ROUTES.world_gen_start.timeoutMs).toBe(90_000);
    expect(LLM_ROUTES.world_gen.timeoutMs).toBe(150_000);
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
    expect(problems).toHaveLength(10);
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
