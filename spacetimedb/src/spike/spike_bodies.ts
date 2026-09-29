// Throwaway spike (phase 39): pure request builders and response parsers.
// No SpacetimeDB imports, so the unit tests run in plain Node. Deleted at phase end.
import {
  buildSkillGenResponseFormat,
  buildSkillGenSystemPrompt,
  buildSkillGenUserPrompt,
  buildRegionGenerationUserPrompt,
  buildWorldGenPrompt,
} from '../data/llm_prompts';
import { redactSecrets, type Usage } from '../helpers/measurement';

export type SpikeKind = 'noop' | 'public_url' | 'models' | 'messages';
export type SpikeRoute = 'minimal' | 'skill' | 'region' | 'region_core' | 'region_population';

export interface SpikeSpec {
  kind: SpikeKind;
  class: 'reliability' | 'drill' | 'exploratory';
  route?: SpikeRoute; // required when kind === 'messages'
  effort?: 'low' | 'medium'; // required when kind === 'messages'
  thinking?: 'between_tools'; // exploratory variant only
  keyMode?: 'stored' | 'bad'; // default 'stored' for models/messages
  timeoutMs?: number; // default per kind; 50 for the timeout drill; max 180000
}

export const MODEL = 'claude-sonnet-5-5';
export const ANTHROPIC_VERSION = '2023-06-01';
export const ANTHROPIC_HOST = 'api.anthropic.com';
export const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const MODELS_URL = 'https://api.anthropic.com/v1/models?limit=100';
export const PUBLIC_URL = 'https://example.com/';
export const BAD_KEY_VALUE = 'invalid-key-for-drill-0000';
export const MAX_TIMEOUT_MS = 180000;

export const MAX_TOKENS: Record<SpikeRoute, number> = {
  minimal: 256,
  skill: 4096,
  region: 8192,
  region_core: 8192,
  region_population: 8192,
};

export const DEFAULT_TIMEOUT_MS = {
  noop: 0,
  public_url: 30000,
  models: 30000,
  minimal: 60000,
  skill: 120000,
  region: 150000,
  region_core: 150000,
  region_population: 150000,
} as const;

/** Effective timeout for a spec: explicit value, else the default for its kind/route. */
export function timeoutMsFor(spec: SpikeSpec): number {
  if (spec.timeoutMs !== undefined) return spec.timeoutMs;
  if (spec.kind === 'messages') return DEFAULT_TIMEOUT_MS[spec.route as SpikeRoute];
  return DEFAULT_TIMEOUT_MS[spec.kind];
}

const KINDS: readonly string[] = ['noop', 'public_url', 'models', 'messages'];
const CLASSES: readonly string[] = ['reliability', 'drill', 'exploratory'];
const ROUTES: readonly string[] = ['minimal', 'skill', 'region', 'region_core', 'region_population'];
const EFFORTS: readonly string[] = ['low', 'medium'];

/** Parse and validate a spec JSON string. Throws Error with a plain message on any problem. */
export function validateSpec(json: string): SpikeSpec {
  let raw: any;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('spec is not valid JSON');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('spec must be an object');
  if (!KINDS.includes(raw.kind)) throw new Error('unknown spec kind');
  if (!CLASSES.includes(raw.class)) throw new Error('unknown spec class');
  const spec: SpikeSpec = { kind: raw.kind, class: raw.class };
  if (raw.kind === 'messages') {
    if (!ROUTES.includes(raw.route)) throw new Error('messages spec needs a valid route');
    if (!EFFORTS.includes(raw.effort)) throw new Error('messages spec needs effort low or medium');
    spec.route = raw.route;
    spec.effort = raw.effort;
  } else {
    if (raw.route !== undefined && !ROUTES.includes(raw.route)) throw new Error('unknown route');
    if (raw.effort !== undefined && !EFFORTS.includes(raw.effort)) throw new Error('unknown effort');
    if (raw.route !== undefined) spec.route = raw.route;
    if (raw.effort !== undefined) spec.effort = raw.effort;
  }
  if (raw.thinking !== undefined) {
    if (raw.kind !== 'messages') throw new Error('thinking is only valid on a messages spec');
    if (raw.thinking !== 'between_tools') throw new Error('unknown thinking variant');
    spec.thinking = raw.thinking;
  }
  if (raw.keyMode !== undefined) {
    if (raw.keyMode !== 'stored' && raw.keyMode !== 'bad') throw new Error('unknown keyMode');
    spec.keyMode = raw.keyMode;
  }
  if (raw.timeoutMs !== undefined) {
    if (
      typeof raw.timeoutMs !== 'number' ||
      !Number.isFinite(raw.timeoutMs) ||
      raw.timeoutMs < 1 ||
      raw.timeoutMs > MAX_TIMEOUT_MS
    ) {
      throw new Error('timeoutMs must be between 1 and ' + MAX_TIMEOUT_MS);
    }
    spec.timeoutMs = raw.timeoutMs;
  }
  return spec;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * Map an OpenAI-shaped JSON Schema node to the output_config.format shape:
 * every array-valued `type` becomes anyOf of the base types (null stays a member).
 * Pure: never mutates the input.
 */
export function toAnthropicSchema(node: any): any {
  if (Array.isArray(node)) return node.map(toAnthropicSchema);
  if (node && typeof node === 'object') {
    if (Array.isArray(node.type)) {
      const { type, description, ...rest } = node;
      const members = (type as string[]).map((ty) =>
        ty === 'null' ? { type: 'null' } : { type: ty, ...toAnthropicSchema(rest) },
      );
      // The rest keywords (enum, items...) belong to the non-null members only.
      return { ...(description ? { description } : {}), anyOf: members };
    }
    const out: any = {};
    for (const [k, v] of Object.entries(node)) out[k] = toAnthropicSchema(v);
    return out;
  }
  return node;
}

// Computed once at module load so every request carries the same object (schema compile cache).
export const SKILL_JSON_SCHEMA: any = toAnthropicSchema((buildSkillGenResponseFormat() as any).json_schema.schema);

function obj(props: Record<string, any>): any {
  return { type: 'object', additionalProperties: false, required: Object.keys(props), properties: props };
}
const S = { type: 'string' };
const strs = { type: 'array', items: S };

const REGION_CORE_PROPS: Record<string, any> = {
  regionName: S,
  regionDescription: S,
  biome: {
    type: 'string',
    enum: ['volcanic', 'forest', 'tundra', 'desert', 'swamp', 'mountains', 'plains', 'coastal', 'cavern', 'ruins'],
  },
  dominantFaction: S,
  landmarks: strs,
  threats: strs,
  locations: {
    type: 'array',
    items: obj({
      name: S,
      description: S,
      terrainType: { type: 'string', enum: ['mountains', 'woods', 'plains', 'swamp', 'dungeon', 'town', 'city'] },
      isSafe: { type: 'boolean' },
      levelOffset: { type: 'integer' },
      connectsTo: strs,
    }),
  },
};

const REGION_POPULATION_PROPS: Record<string, any> = {
  npcs: {
    type: 'array',
    items: obj({
      name: S,
      npcType: { type: 'string', enum: ['vendor', 'questgiver', 'lore', 'trainer', 'guard', 'crafter', 'banker'] },
      locationName: S,
      description: S,
      greeting: S,
      personality: obj({
        traits: strs,
        speechPattern: S,
        knowledgeDomains: strs,
        secrets: strs,
        affinityMultiplier: { type: 'number' },
      }),
    }),
  },
  enemies: {
    type: 'array',
    items: obj({
      name: S,
      creatureType: { type: 'string', enum: ['beast', 'undead', 'humanoid', 'elemental', 'construct', 'aberration'] },
      role: { type: 'string', enum: ['melee', 'ranged', 'caster'] },
      terrainTypes: S,
      groupMin: { type: 'integer' },
      groupMax: { type: 'integer' },
      level: { type: 'integer' },
    }),
  },
};

// Hand-written equivalent of the REGION_GENERATION_SCHEMA example string (which is not a JSON Schema).
export const REGION_JSON_SCHEMA: any = obj({ ...REGION_CORE_PROPS, ...REGION_POPULATION_PROPS });
// Staged-schema workaround pair, used only if the full schema hits a complexity limit.
export const REGION_CORE_JSON_SCHEMA: any = obj(REGION_CORE_PROPS);
export const REGION_POPULATION_JSON_SCHEMA: any = obj(REGION_POPULATION_PROPS);

// ---------------------------------------------------------------------------
// Request building
// ---------------------------------------------------------------------------

export interface BuiltRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  maxTokens: number;
  requestChars: number;
}

const JSON_INSTRUCTION_MARKER = 'Respond with ONLY valid JSON';

/** Slice a prompt before the first "Respond with ONLY valid JSON" instruction and trim. */
export function cutBeforeJsonInstruction(text: string): string {
  const idx = text.indexOf(JSON_INSTRUCTION_MARKER);
  return (idx >= 0 ? text.slice(0, idx) : text).trim();
}

function hostOf(url: string): string {
  const m = /^https:\/\/([^/:?#]+)/i.exec(url);
  return m ? m[1].toLowerCase() : '';
}

function keyFor(spec: SpikeSpec, storedKey: string): string {
  return spec.keyMode === 'bad' ? BAD_KEY_VALUE : storedKey;
}

function withHeaders(url: string, spec: SpikeSpec, storedKey: string, json: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (hostOf(url) !== ANTHROPIC_HOST) return headers; // the key never leaves for another host
  if (json) headers['content-type'] = 'application/json';
  headers['anthropic-version'] = ANTHROPIC_VERSION;
  headers['x-api-key'] = keyFor(spec, storedKey);
  return headers;
}

// Fixed sample inputs so runs are byte-identical.
function skillPrompts(): { system: string; user: string } {
  return {
    system: buildSkillGenSystemPrompt(),
    user: cutBeforeJsonInstruction(buildSkillGenUserPrompt('Vessa', 'Human', 'Spellblade', 'arcane', 5n, [])),
  };
}

function regionPrompts(): { system: string; user: string } {
  return {
    system: buildWorldGenPrompt(''),
    user: cutBeforeJsonInstruction(
      buildRegionGenerationUserPrompt('Human', 'Spellblade', 'arcane', 'Ashfall Reach', [
        { name: 'Cinder Steppe', biome: 'volcanic', threats: 'fire drakes' },
      ]),
    ),
  };
}

const STAGED_SUFFIX: Partial<Record<SpikeRoute, string>> = {
  region_core:
    '\n\nStage 1 of 2: return only the region core (name, description, biome, faction, landmarks, threats, locations).',
  region_population:
    '\n\nStage 2 of 2: return only the population (npcs and enemies) for the region described above.',
};

/** Build the HTTP request for a spec. The stored key is attached only for api.anthropic.com. */
export function buildRequest(spec: SpikeSpec, storedKey: string): BuiltRequest {
  if (spec.kind === 'noop') {
    return { url: '', method: 'GET', headers: {}, maxTokens: 0, requestChars: 0 };
  }
  if (spec.kind === 'public_url') {
    return { url: PUBLIC_URL, method: 'GET', headers: {}, maxTokens: 0, requestChars: PUBLIC_URL.length };
  }
  if (spec.kind === 'models') {
    return {
      url: MODELS_URL,
      method: 'GET',
      headers: withHeaders(MODELS_URL, spec, storedKey, false),
      maxTokens: 0,
      requestChars: MODELS_URL.length,
    };
  }

  const route = spec.route as SpikeRoute;
  const maxTokens = MAX_TOKENS[route];
  const outputConfig: any = { effort: spec.effort };
  const body: any = { model: MODEL, max_tokens: maxTokens };
  let userText: string;

  if (route === 'minimal') {
    userText = 'Reply with exactly: pong';
    body.output_config = outputConfig;
  } else {
    const prompts = route === 'skill' ? skillPrompts() : regionPrompts();
    userText = prompts.user + (STAGED_SUFFIX[route] ?? '');
    const schema =
      route === 'skill'
        ? SKILL_JSON_SCHEMA
        : route === 'region'
          ? REGION_JSON_SCHEMA
          : route === 'region_core'
            ? REGION_CORE_JSON_SCHEMA
            : REGION_POPULATION_JSON_SCHEMA;
    outputConfig.format = { type: 'json_schema', schema };
    body.system = [{ type: 'text', text: prompts.system, cache_control: { type: 'ephemeral' } }];
    body.output_config = outputConfig;
  }
  if (spec.thinking === 'between_tools') body.thinking = { type: 'between_tools' };
  body.messages = [{ role: 'user', content: userText }];

  const text = JSON.stringify(body);
  return {
    url: MESSAGES_URL,
    method: 'POST',
    headers: withHeaders(MESSAGES_URL, spec, storedKey, true),
    body: text,
    maxTokens,
    requestChars: text.length,
  };
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

export interface ParsedResponse {
  stopReason: string | null;
  usage: Usage | null;
  parsedOk: boolean;
  requiredKeysOk: boolean;
  contentOk: boolean;
  modelListed: boolean;
  anthropicErrorType: string | null;
  errorMessage: string | null;
}

const ERROR_MESSAGE_CAP = 400;

function cap(message: string): string {
  return redactSecrets(message).slice(0, ERROR_MESSAGE_CAP);
}

function num(v: any): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function requiredKeysFor(route: SpikeRoute | undefined): readonly string[] | null {
  if (route === 'region') return REGION_JSON_SCHEMA.required;
  if (route === 'region_core') return REGION_CORE_JSON_SCHEMA.required;
  if (route === 'region_population') return REGION_POPULATION_JSON_SCHEMA.required;
  return null;
}

/** Interpret an HTTP response for a spec. Never throws. */
export function parseResponse(spec: SpikeSpec, status: number, bodyText: string): ParsedResponse {
  const out: ParsedResponse = {
    stopReason: null,
    usage: null,
    parsedOk: false,
    requiredKeysOk: false,
    contentOk: false,
    modelListed: false,
    anthropicErrorType: null,
    errorMessage: null,
  };

  if (spec.kind === 'noop') {
    return { ...out, parsedOk: true, requiredKeysOk: true, contentOk: true };
  }

  let json: any = null;
  let jsonOk = false;
  try {
    json = JSON.parse(bodyText);
    jsonOk = true;
  } catch {
    jsonOk = false;
  }

  if (status !== 200) {
    if (jsonOk && json && json.error && typeof json.error === 'object') {
      out.anthropicErrorType = typeof json.error.type === 'string' ? json.error.type : null;
      out.errorMessage = cap(String(json.error.message ?? ''));
    } else {
      out.errorMessage = cap(String(bodyText ?? ''));
    }
    return out;
  }

  if (spec.kind === 'public_url') {
    return { ...out, parsedOk: true, requiredKeysOk: true, contentOk: true };
  }

  if (!jsonOk || !json || typeof json !== 'object') {
    out.errorMessage = 'unparseable response body';
    return out;
  }

  if (spec.kind === 'models') {
    const data = Array.isArray(json.data) ? json.data : null;
    out.parsedOk = data !== null;
    out.requiredKeysOk = data !== null;
    out.modelListed = !!data && data.some((m: any) => m && m.id === MODEL);
    out.contentOk = data !== null;
    return out;
  }

  // messages
  out.stopReason = typeof json.stop_reason === 'string' ? json.stop_reason : null;
  const u = json.usage;
  if (u && typeof u === 'object') {
    out.usage = {
      input: num(u.input_tokens),
      output: num(u.output_tokens),
      cacheWrite: num(u.cache_creation_input_tokens),
      cacheRead: num(u.cache_read_input_tokens),
    };
  }
  const blocks: any[] = Array.isArray(json.content) ? json.content : [];
  const textBlock = blocks.find((b) => b && b.type === 'text');
  const text: string | null = textBlock && typeof textBlock.text === 'string' ? textBlock.text : null;

  const route = spec.route;
  if (route === 'minimal') {
    out.parsedOk = text !== null && text.length > 0;
    out.requiredKeysOk = out.parsedOk;
  } else if (text !== null) {
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
      out.parsedOk = !!parsed && typeof parsed === 'object' && !Array.isArray(parsed);
    } catch {
      out.parsedOk = false;
    }
    if (out.parsedOk) {
      if (route === 'skill') {
        out.requiredKeysOk = Array.isArray(parsed.skills) && parsed.skills.length > 0;
      } else {
        const required = requiredKeysFor(route);
        out.requiredKeysOk = !!required && required.every((k) => k in parsed);
      }
    }
  }
  out.contentOk = out.stopReason === 'end_turn' && out.parsedOk && out.requiredKeysOk;
  return out;
}
