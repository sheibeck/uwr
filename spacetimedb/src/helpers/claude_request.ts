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
import { redactSecrets, type Usage } from './measurement';

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

// ----------------------------------------------------------------------------
// Response classification
// ----------------------------------------------------------------------------

export type ClaudeFailureClass =
  | 'auth'
  | 'billing'
  | 'rate_limit'
  | 'overloaded'
  | 'server'
  | 'bad_request'
  | 'timeout'
  | 'network'
  | 'truncated'
  | 'refusal'
  | 'invalid_json'
  | 'schema_mismatch'
  | 'empty_output'
  | 'unexpected_stop';

export type ClaudeResult =
  | {
      ok: true;
      text: string;
      json?: unknown;
      stopReason: string;
      usage: Usage;
      requestId?: string;
    }
  | {
      ok: false;
      class: ClaudeFailureClass;
      retryable: boolean;
      retryAfterSeconds?: number;
      httpStatus?: number;
      errorType?: string;
      stopReason?: string;
      stopCategory?: string;
      usage?: Usage;
      requestId?: string;
      /** Redacted and capped at CLAUDE_MESSAGE_MAX_CHARS code points. */
      message: string;
    };

/** Transient classes a caller may retry. Everything else needs a code, key or budget change. */
export const RETRYABLE_CLASSES: readonly ClaudeFailureClass[] = Object.freeze([
  'rate_limit',
  'overloaded',
  'server',
  'timeout',
  'network',
] as ClaudeFailureClass[]);

export const CLAUDE_MESSAGE_MAX_CHARS = 400;

const isRetryable = (c: ClaudeFailureClass): boolean => RETRYABLE_CLASSES.includes(c);

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Options for the classifiers. `needles` are exact strings (the live API key,
 * in any form the caller knows) that are redacted from every failure message,
 * on top of the key-shaped pattern, so a body that echoes the key without its
 * usual prefix still stores nothing.
 */
export interface ClassifyOptions {
  needles?: readonly string[];
}

/** Redact secrets first (so a cut can never leave half a key), then cap by code point. */
function safeMessage(raw: string, needles?: readonly string[]): string {
  const redacted = redactSecrets(String(raw), needles).replace(LONE_SURROGATE, '�');
  return Array.from(redacted).slice(0, CLAUDE_MESSAGE_MAX_CHARS).join('');
}

/** First content block whose type is 'text'. Never the first block by position: a thinking block may come first. */
export function findFirstTextBlock(content: unknown): { type: 'text'; text: string } | undefined {
  if (!Array.isArray(content)) return undefined;
  for (const block of content) {
    if (isPlainObject(block) && block.type === 'text') {
      return { type: 'text', text: typeof block.text === 'string' ? block.text : '' };
    }
  }
  return undefined;
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/** The four usage counters; a missing field (cache fields are often absent) is 0. */
export function extractUsage(body: unknown): Usage {
  const u = isPlainObject(body) && isPlainObject(body.usage) ? body.usage : {};
  return {
    input: count(u.input_tokens),
    output: count(u.output_tokens),
    cacheWrite: count(u.cache_creation_input_tokens),
    cacheRead: count(u.cache_read_input_tokens),
  };
}

type ResponseLike = { status: number; headers: { get(name: string): string | null }; text(): string };

function parseRetryAfter(headers: ResponseLike['headers']): number | undefined {
  let raw: string | null = null;
  try {
    raw = headers.get('retry-after');
  } catch {
    return undefined;
  }
  if (raw === null || raw === undefined) return undefined;
  const trimmed = String(raw).trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined; // HTTP-date form or junk: treat as absent
  return Number(trimmed);
}

function requestIdOf(headers: ResponseLike['headers'], body: unknown): string | undefined {
  let fromHeader: string | null = null;
  try {
    fromHeader = headers.get('request-id');
  } catch {
    fromHeader = null;
  }
  if (fromHeader) return fromHeader;
  if (isPlainObject(body) && typeof body.request_id === 'string' && body.request_id) return body.request_id;
  return undefined;
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function fail(
  cls: ClaudeFailureClass,
  message: string,
  extra: Partial<Omit<Extract<ClaudeResult, { ok: false }>, 'ok' | 'class' | 'retryable' | 'message'>> = {},
  needles?: readonly string[],
): ClaudeResult {
  const result: Extract<ClaudeResult, { ok: false }> = {
    ok: false,
    class: cls,
    retryable: isRetryable(cls),
    message: safeMessage(message, needles),
  };
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) (result as Record<string, unknown>)[k] = v;
  }
  return result;
}

const SPEND_LIMIT_400 = /you have reached your specified .*api usage limits/i;

function classifyHttpFailure(res: ResponseLike, text: string, needles?: readonly string[]): ClaudeResult {
  const status = res.status;
  const parsed = tryParse(text);
  const body = parsed.ok ? parsed.value : undefined;
  const err = isPlainObject(body) && isPlainObject(body.error) ? body.error : undefined;
  const errorType = err && typeof err.type === 'string' ? err.type : undefined;
  const errorMessage = err && err.message !== undefined ? String(err.message) : '';
  const errorCode =
    err && isPlainObject(err.details) && typeof err.details.error_code === 'string' ? err.details.error_code : undefined;

  let cls: ClaudeFailureClass;
  if (status === 401 || status === 403) cls = 'auth';
  else if (status === 402) cls = 'billing';
  else if (status === 400) cls = SPEND_LIMIT_400.test(errorMessage) ? 'billing' : 'bad_request';
  else if (status === 429) cls = errorCode === 'enforced_spend_limit_reached' ? 'billing' : 'rate_limit';
  else if (status === 529) cls = 'overloaded';
  else if (status >= 500) cls = 'server';
  else if (status >= 400) cls = 'bad_request';
  else cls = 'server'; // a status this API never returns for a request we made

  const retryAfterSeconds = isRetryable(cls) ? parseRetryAfter(res.headers) : undefined;
  const detail = [errorType, errorMessage].filter(Boolean).join(': ') || (parsed.ok ? 'no error detail' : 'non-JSON body');
  return fail(
    cls,
    `HTTP ${status} ${detail}`,
    {
      httpStatus: status,
      errorType,
      retryAfterSeconds,
      requestId: requestIdOf(res.headers, body),
    },
    needles,
  );
}

function requiredKeys(route: LlmRoute): string[] {
  const out = LLM_ROUTES[route].output;
  if (out.kind !== 'json') return [];
  const req = (out.schema as { required?: unknown }).required;
  return Array.isArray(req) ? req.filter((k): k is string => typeof k === 'string') : [];
}

/**
 * Classify an HTTP response. Never throws for any body shape, including a body
 * whose read throws (a network failure). For a 200 it branches on stop_reason
 * first, then reads the FIRST text block by type. `opts.needles` are redacted
 * from every failure message.
 */
export function classifyClaudeResponse(route: LlmRoute, res: ResponseLike, opts?: ClassifyOptions): ClaudeResult {
  const needles = opts?.needles;
  let text: string;
  try {
    text = res.text();
  } catch (err) {
    let detail: string;
    try {
      detail = err instanceof Error ? err.message : String(err);
    } catch {
      detail = 'unprintable error';
    }
    return fail(
      'network',
      `response body could not be read: ${detail}`,
      { httpStatus: typeof res.status === 'number' ? res.status : undefined },
      needles,
    );
  }
  if (!(res.status >= 200 && res.status < 300)) return classifyHttpFailure(res, text, needles);
  const failWith: typeof fail = (cls, message, extra) => fail(cls, message, extra, needles);

  const parsed = tryParse(text);
  if (!parsed.ok || !isPlainObject(parsed.value)) {
    return failWith('server', `HTTP ${res.status} response body was not a JSON object`, {
      httpStatus: res.status,
      requestId: requestIdOf(res.headers, undefined),
    });
  }
  const body = parsed.value;
  const requestId = requestIdOf(res.headers, body);
  const usage = extractUsage(body);
  const stopReason = typeof body.stop_reason === 'string' ? body.stop_reason : undefined;

  if (stopReason === 'refusal') {
    const details = isPlainObject(body.stop_details) ? body.stop_details : {};
    const category = typeof details.category === 'string' ? details.category : undefined;
    const explanation = typeof details.explanation === 'string' ? details.explanation : '';
    return failWith('refusal', `model refused${category ? ` (${category})` : ''}${explanation ? `: ${explanation}` : ''}`, {
      stopReason,
      stopCategory: category,
      usage,
      requestId,
    });
  }
  if (stopReason === 'max_tokens') {
    return failWith('truncated', 'output hit max_tokens before completing', { stopReason, usage, requestId });
  }
  // Allowlist: only end_turn is a complete answer. tool_use, pause_turn, stop_sequence,
  // model_context_window_exceeded, any future reason and a MISSING stop_reason (a
  // non-streaming 200 always carries one) all mean the text may be truncated or wrong.
  if (stopReason !== 'end_turn') {
    return failWith(
      'unexpected_stop',
      stopReason === undefined ? 'response had no stop_reason' : `unexpected stop_reason ${stopReason}`,
      { stopReason, usage, requestId },
    );
  }

  const block = findFirstTextBlock(body.content);
  if (!block || block.text.trim() === '') {
    return failWith('empty_output', 'response had no non-empty text block', {
      stopReason,
      usage,
      requestId,
    });
  }

  const finalStop = stopReason;
  if (LLM_ROUTES[route].output.kind !== 'json') {
    return { ok: true, text: block.text, stopReason: finalStop, usage, requestId };
  }

  const json = tryParse(block.text);
  if (!json.ok) {
    return failWith('invalid_json', 'text block was not strict JSON', { stopReason: finalStop, usage, requestId });
  }
  if (!isPlainObject(json.value)) {
    return failWith('schema_mismatch', 'JSON was not an object', { stopReason: finalStop, usage, requestId });
  }
  const missing = requiredKeys(route).filter((k) => !(k in (json.value as Record<string, unknown>)));
  if (missing.length > 0) {
    return failWith('schema_mismatch', `JSON is missing required key(s): ${missing.join(', ')}`, {
      stopReason: finalStop,
      usage,
      requestId,
    });
  }
  return { ok: true, text: block.text, json: json.value, stopReason: finalStop, usage, requestId };
}

/**
 * Classify a thrown fetch error: a timeout, or any other transport failure (network).
 * `opts.needles` are redacted from the stored message.
 */
export function classifyClaudeError(err: unknown, opts?: ClassifyOptions): ClaudeResult {
  let message: string;
  try {
    message = err instanceof Error ? err.message : String(err);
  } catch {
    message = 'unprintable error';
  }
  const cls: ClaudeFailureClass = /time(d)?\s?out/i.test(message) ? 'timeout' : 'network';
  return fail(cls, `fetch failed: ${message}`, {}, opts?.needles);
}
