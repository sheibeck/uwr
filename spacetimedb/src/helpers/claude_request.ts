// ============================================================================
// Claude request builder and response classifier (pure module)
// ============================================================================
//
// Executor-agnostic. Phase 41's procedure calls buildClaudeRequest and
// buildClaudeHeaders to make the call, then hands the response (or the thrown
// fetch error) to classifyClaudeResponse / classifyClaudeError. Nothing here
// performs I/O.
//
// Pure-module rule (RESEARCH Pitfall 1): imports only ../data/llm_models,
// ../data/llm_routes, ../data/keeper_bible and ./measurement. No runtime import
// from the server entry point or from any DB-touching helper.
//
// The API key appears ONLY as the argument of buildClaudeHeaders. It is never
// part of a body, a result or a message.
// ============================================================================

import { CLAUDE_MODEL, ANTHROPIC_VERSION } from '../data/llm_models';
import { LLM_ROUTES, LLM_EFFORTS, type LlmRoute } from '../data/llm_routes';
import { KEEPER_BIBLE } from '../data/keeper_bible';
// (measurement import is added with the response classifier)

// ----------------------------------------------------------------------------
// Request body
// ----------------------------------------------------------------------------

export const ALLOWED_TOP_LEVEL_KEYS = ['model', 'max_tokens', 'system', 'messages', 'output_config'] as const;

/**
 * Parameters Sonnet 5.5 rejects (400) or that we never want: sampling params,
 * thinking configuration, forced tool use, prefill (checked separately as an
 * assistant message) and legacy/foreign structured-output spellings.
 */
export const FORBIDDEN_BODY_KEYS = [
  'temperature',
  'top_p',
  'top_k',
  'thinking',
  'budget_tokens',
  'tool_choice',
  'tools',
  'output_format',
  'response_format',
  'stop_sequences',
  'fallbacks',
] as const;

/** The API allows at most 4 cache breakpoints; the locked layout uses 2. */
export const MAX_CACHE_BREAKPOINTS = 4;

export interface ClaudeTextBlock {
  type: 'text';
  text: string;
  cache_control: { type: 'ephemeral' };
}

export interface ClaudeBody {
  model: typeof CLAUDE_MODEL;
  max_tokens: number;
  system: ClaudeTextBlock[];
  messages: { role: 'user'; content: string }[];
  output_config: {
    effort: (typeof LLM_EFFORTS)[number];
    format?: { type: 'json_schema'; schema: object };
  };
}

export interface ClaudeLayers {
  /** system[1]: static per route. */
  routeBlock: string;
  /** The single user message: per-call facts and tagged player text. */
  volatile: string;
}

export interface ClaudeRequest {
  body: ClaudeBody;
  /** JSON.stringify(body): byte-stable for identical inputs (fixed key order). */
  bodyText: string;
  timeoutMs: number;
}

const isPlainObject = (v: unknown): v is Record<string, any> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Walk the body and report forbidden keys and cache_control count. The JSON
 * Schema under output_config.format.schema is data (a property may legitimately
 * be called "tools"), so it is not scanned.
 */
function scanBody(node: unknown, path: string, found: { forbidden: string[]; cacheBreakpoints: number }): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => scanBody(item, `${path}[${i}]`, found));
    return;
  }
  if (!isPlainObject(node)) return;
  for (const [key, value] of Object.entries(node)) {
    const childPath = path ? `${path}.${key}` : key;
    if ((FORBIDDEN_BODY_KEYS as readonly string[]).includes(key)) found.forbidden.push(childPath);
    if (key === 'cache_control') found.cacheBreakpoints++;
    if (childPath === 'output_config.format.schema') continue;
    scanBody(value, childPath, found);
  }
}

/**
 * Runtime guard on a built body. Throws a plain Error naming the first problem.
 * Called by buildClaudeRequest before returning, and usable by any caller that
 * assembles a body by hand.
 */
export function assertValidClaudeBody(body: unknown, route: LlmRoute): void {
  const cfg = LLM_ROUTES[route];
  if (!cfg) throw new Error(`claude body: unknown route ${String(route)}`);
  if (!isPlainObject(body)) throw new Error('claude body: must be an object');

  for (const key of Object.keys(body)) {
    if (!(ALLOWED_TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      throw new Error(`claude body: top-level key "${key}" is not allowed`);
    }
  }

  const found = { forbidden: [] as string[], cacheBreakpoints: 0 };
  scanBody(body, '', found);
  if (found.forbidden.length > 0) {
    throw new Error(`claude body: forbidden parameter ${found.forbidden.join(', ')}`);
  }

  if (body.model !== CLAUDE_MODEL) throw new Error('claude body: model must be CLAUDE_MODEL');
  if (typeof body.max_tokens !== 'number' || !Number.isInteger(body.max_tokens) || body.max_tokens <= 0) {
    throw new Error('claude body: max_tokens must be a positive integer');
  }

  const oc = body.output_config;
  if (!isPlainObject(oc)) throw new Error('claude body: output_config is required');
  if (!(LLM_EFFORTS as readonly unknown[]).includes(oc.effort)) {
    throw new Error('claude body: output_config.effort must be set to low, medium or high');
  }

  const system = body.system;
  if (
    !Array.isArray(system) ||
    system.length !== 2 ||
    !system.every((b) => isPlainObject(b) && b.type === 'text' && typeof b.text === 'string')
  ) {
    throw new Error('claude body: system must be exactly two text blocks');
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length !== 1) {
    throw new Error('claude body: messages must be exactly one user message');
  }
  const msg = messages[0];
  if (!isPlainObject(msg) || msg.role !== 'user') {
    throw new Error('claude body: messages[0] must have role user (an assistant message is prefill)');
  }

  if (found.cacheBreakpoints > MAX_CACHE_BREAKPOINTS) {
    throw new Error(`claude body: ${found.cacheBreakpoints} cache breakpoints exceed the maximum of ${MAX_CACHE_BREAKPOINTS}`);
  }

  if (cfg.output.kind === 'json') {
    const fmt = oc.format;
    if (!isPlainObject(fmt) || fmt.type !== 'json_schema' || !isPlainObject(fmt.schema)) {
      throw new Error(`claude body: route ${route} is a json route and needs output_config.format json_schema`);
    }
  } else if ('format' in oc) {
    throw new Error(`claude body: route ${route} is a text route and must not carry output_config.format`);
  }
}

/**
 * Build the Sonnet 5.5 request for a route. A FRESH body is constructed on
 * every call in a fixed key order so JSON.stringify is byte-stable. The volatile
 * tail is the only per-call text and lives in the user message; system and
 * output_config depend on the route alone (the cache guard).
 */
export function buildClaudeRequest(route: LlmRoute, layers: ClaudeLayers): ClaudeRequest {
  const cfg = LLM_ROUTES[route];
  if (!cfg) throw new Error(`buildClaudeRequest: unknown route ${String(route)}`);

  const outputConfig: ClaudeBody['output_config'] =
    cfg.output.kind === 'json'
      ? { effort: cfg.effort, format: { type: 'json_schema', schema: cfg.output.schema } }
      : { effort: cfg.effort };

  const body: ClaudeBody = {
    model: CLAUDE_MODEL,
    max_tokens: cfg.maxTokens,
    system: [
      { type: 'text', text: KEEPER_BIBLE, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: layers.routeBlock, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: layers.volatile }],
    output_config: outputConfig,
  };

  assertValidClaudeBody(body, route);
  return { body, bodyText: JSON.stringify(body), timeoutMs: cfg.timeoutMs };
}

/** The only place the API key is used. */
export function buildClaudeHeaders(apiKey: string): Record<string, string> {
  if (typeof apiKey !== 'string' || apiKey.length === 0) throw new Error('buildClaudeHeaders: apiKey is required');
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
  };
}

