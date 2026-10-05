// ============================================================================
// Claude route table (pure module)
// ============================================================================
//
// One typed table holds every per-route request parameter. The request builder
// (Plan 40-03) reads only from here. Effort, max_tokens and timeout are tuned in
// llm_tuning.ts (LLM_TUNING) and trace to llm_measurements.json, or are the
// documented baseline while a route has no measurement; no timeout may exceed
// ANTHROPIC_MAX_TIMEOUT_MS.
//
// Staged generation (Phase 43): creation_class_reveal and world_gen_start are
// the stage-1 routes (small schema, fast reveal); creation_class and world_gen
// are the stage-2 fill routes that complete the class and the region.
//
// combat_narration is a JSON route (structured output) that returns segments.
// npc_conversation is a text route: it is prompt-instructed JSON parsed by the
// existing tolerant extractor (no output_config.format).
// ============================================================================

import { CLAUDE_MODEL, ANTHROPIC_MAX_TIMEOUT_MS } from './llm_models';
import { LLM_TUNING } from './llm_tuning';
import {
  RACE_SCHEMA,
  CLASS_REVEAL_SCHEMA,
  CLASS_FILL_SCHEMA,
  WORLD_START_SCHEMA,
  REGION_FILL_SCHEMA,
  SKILL_GENERATION_SCHEMA,
  RENOWN_PERK_SCHEMA,
  COMBAT_NARRATION_SCHEMA,
  deepFreeze,
} from './llm_schemas';

export const LLM_ROUTE_NAMES = [
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
] as const;
export type LlmRoute = (typeof LLM_ROUTE_NAMES)[number];

export const LLM_EFFORTS = ['low', 'medium', 'high'] as const;
export type LlmEffort = (typeof LLM_EFFORTS)[number];

export interface RouteConfig {
  model: typeof CLAUDE_MODEL;
  /** Explicit, never omitted (Sonnet 5.5 defaults to high, which is slow). */
  effort: LlmEffort;
  maxTokens: number;
  timeoutMs: number;
  output: { kind: 'json'; schema: object } | { kind: 'text' };
  /** Both true everywhere; default 5-minute TTL (no ttl field). */
  cache: { bible: boolean; route: boolean };
}

function route(name: LlmRoute, output: RouteConfig['output']): RouteConfig {
  const tuned = LLM_TUNING[name];
  return {
    model: CLAUDE_MODEL,
    effort: tuned.effort,
    maxTokens: tuned.maxTokens,
    timeoutMs: tuned.timeoutMs,
    output,
    cache: { bible: true, route: true },
  };
}

export const LLM_ROUTES: Readonly<Record<LlmRoute, RouteConfig>> = deepFreeze({
  creation_race: route('creation_race', { kind: 'json', schema: RACE_SCHEMA }),
  creation_class_reveal: route('creation_class_reveal', { kind: 'json', schema: CLASS_REVEAL_SCHEMA }),
  creation_class: route('creation_class', { kind: 'json', schema: CLASS_FILL_SCHEMA }),
  world_gen_start: route('world_gen_start', { kind: 'json', schema: WORLD_START_SCHEMA }),
  world_gen: route('world_gen', { kind: 'json', schema: REGION_FILL_SCHEMA }),
  skill_gen: route('skill_gen', { kind: 'json', schema: SKILL_GENERATION_SCHEMA }),
  npc_conversation: route('npc_conversation', { kind: 'text' }),
  combat_narration: route('combat_narration', { kind: 'json', schema: COMBAT_NARRATION_SCHEMA }),
  renown_perk_gen: route('renown_perk_gen', { kind: 'json', schema: RENOWN_PERK_SCHEMA }),
  smoke_test: route('smoke_test', { kind: 'text' }),
});

export function isLlmRoute(x: unknown): x is LlmRoute {
  return typeof x === 'string' && (LLM_ROUTE_NAMES as readonly string[]).includes(x);
}

const isPositiveInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;

/** Returns a list of problems in a route table. An empty array means the table is valid. */
export function validateRoutes(routes: Record<string, unknown>): string[] {
  const problems: string[] = [];

  for (const name of LLM_ROUTE_NAMES) {
    if (!(name in routes)) problems.push(`${name}: missing route`);
  }
  for (const key of Object.keys(routes)) {
    if (!isLlmRoute(key)) problems.push(`${key}: unknown route`);
  }

  for (const [name, raw] of Object.entries(routes)) {
    if (!isLlmRoute(name)) continue;
    const cfg = (raw ?? {}) as Partial<RouteConfig> & Record<string, any>;
    if (cfg.model !== CLAUDE_MODEL) problems.push(`${name}: model must be CLAUDE_MODEL`);
    if (!(LLM_EFFORTS as readonly unknown[]).includes(cfg.effort)) {
      problems.push(`${name}: effort must be one of ${LLM_EFFORTS.join(', ')}`);
    }
    if (!isPositiveInt(cfg.maxTokens)) problems.push(`${name}: maxTokens must be a positive integer`);
    if (!isPositiveInt(cfg.timeoutMs)) {
      problems.push(`${name}: timeoutMs must be a positive integer`);
    } else if (cfg.timeoutMs > ANTHROPIC_MAX_TIMEOUT_MS) {
      problems.push(`${name}: timeoutMs ${cfg.timeoutMs} exceeds the ${ANTHROPIC_MAX_TIMEOUT_MS} ms platform maximum`);
    }
    const output = cfg.output as Record<string, any> | undefined;
    if (!output || (output.kind !== 'json' && output.kind !== 'text')) {
      problems.push(`${name}: output.kind must be json or text`);
    } else if (output.kind === 'json') {
      if (typeof output.schema !== 'object' || output.schema === null) {
        problems.push(`${name}: json output requires a schema`);
      }
    } else if ('schema' in output && output.schema !== undefined) {
      problems.push(`${name}: text output must not carry a schema`);
    }
    if (!cfg.cache || cfg.cache.bible !== true || cfg.cache.route !== true) {
      problems.push(`${name}: cache.bible and cache.route must both be true`);
    }
  }

  return problems;
}
