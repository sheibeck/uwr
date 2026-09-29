import { describe, it, expect } from 'vitest';
import {
  BAD_KEY_VALUE,
  MAX_TOKENS,
  MODEL,
  REGION_CORE_JSON_SCHEMA,
  REGION_JSON_SCHEMA,
  REGION_POPULATION_JSON_SCHEMA,
  SKILL_JSON_SCHEMA,
  buildRequest,
  cutBeforeJsonInstruction,
  parseResponse,
  toAnthropicSchema,
  validateSpec,
  type SpikeSpec,
} from './spike_bodies';
import {
  buildSkillGenSystemPrompt,
  buildSkillGenUserPrompt,
  buildWorldGenPrompt,
  buildRegionGenerationUserPrompt,
} from '../data/llm_prompts';

// Fake key assembled at runtime; no key-shaped literal exists in this file.
const FAKE_KEY = ['sk', '-ant-', 'api03-', 'Z'.repeat(32)].join('');
const KEY_PREFIX = ['sk', '-ant-'].join('');

function msg(over: Partial<SpikeSpec> = {}): SpikeSpec {
  return { kind: 'messages', class: 'reliability', route: 'minimal', effort: 'low', ...over };
}

function bodyOf(spec: SpikeSpec): any {
  return JSON.parse(buildRequest(spec, FAKE_KEY).body as string);
}

function collectObjects(node: any, out: any[] = []): any[] {
  if (Array.isArray(node)) {
    node.forEach((n) => collectObjects(n, out));
  } else if (node && typeof node === 'object') {
    if (node.type === 'object') out.push(node);
    Object.values(node).forEach((v) => collectObjects(v, out));
  }
  return out;
}

function hasArrayType(node: any): boolean {
  if (Array.isArray(node)) return node.some(hasArrayType);
  if (node && typeof node === 'object') {
    if (Array.isArray(node.type)) return true;
    return Object.values(node).some(hasArrayType);
  }
  return false;
}

describe('validateSpec', () => {
  it('accepts every spec shape later plans use', () => {
    const specs: SpikeSpec[] = [
      { kind: 'noop', class: 'reliability' },
      { kind: 'public_url', class: 'reliability' },
      { kind: 'models', class: 'reliability' },
      msg(),
      msg({ route: 'skill', effort: 'medium' }),
      msg({ route: 'region', effort: 'low' }),
      msg({ route: 'region_core', effort: 'medium' }),
      msg({ route: 'region_population', effort: 'low' }),
      msg({ class: 'exploratory', route: 'skill', effort: 'medium', thinking: 'between_tools' }),
      msg({ class: 'drill', keyMode: 'bad' }),
      msg({ class: 'drill', timeoutMs: 50 }),
      msg({ timeoutMs: 180000 }),
    ];
    for (const s of specs) {
      expect(validateSpec(JSON.stringify(s))).toEqual(s);
    }
  });

  it('rejects an unknown kind', () => {
    expect(() => validateSpec(JSON.stringify({ kind: 'nope', class: 'drill' }))).toThrow();
  });

  it('rejects messages without route or effort', () => {
    expect(() => validateSpec(JSON.stringify({ kind: 'messages', class: 'reliability', effort: 'low' }))).toThrow();
    expect(() => validateSpec(JSON.stringify({ kind: 'messages', class: 'reliability', route: 'minimal' }))).toThrow();
  });

  it('rejects an unknown effort or route', () => {
    expect(() => validateSpec(JSON.stringify(msg({ effort: 'high' as any })))).toThrow();
    expect(() => validateSpec(JSON.stringify(msg({ route: 'other' as any })))).toThrow();
  });

  it('rejects timeoutMs above 180000 and non-positive values', () => {
    expect(() => validateSpec(JSON.stringify(msg({ timeoutMs: 180001 })))).toThrow();
    expect(() => validateSpec(JSON.stringify(msg({ timeoutMs: 0 })))).toThrow();
  });

  it('rejects thinking on anything other than a messages spec', () => {
    expect(() =>
      validateSpec(JSON.stringify({ kind: 'models', class: 'reliability', thinking: 'between_tools' })),
    ).toThrow();
    expect(() => validateSpec(JSON.stringify(msg({ thinking: 'adaptive' as any })))).toThrow();
  });

  it('rejects malformed json and unknown class', () => {
    expect(() => validateSpec('{not json')).toThrow();
    expect(() => validateSpec(JSON.stringify({ kind: 'noop', class: 'weird' }))).toThrow();
  });
});

describe('buildRequest: messages bodies', () => {
  it('targets the messages endpoint with the required headers', () => {
    const r = buildRequest(msg(), FAKE_KEY);
    expect(r.url).toBe('https://api.anthropic.com/v1/messages');
    expect(r.method).toBe('POST');
    expect(r.headers['content-type']).toBe('application/json');
    expect(r.headers['anthropic-version']).toBe('2023-06-01');
    expect(r.headers['x-api-key']).toBe(FAKE_KEY);
  });

  it('uses the Sonnet 5.5 model, explicit effort and a required max_tokens', () => {
    for (const route of ['minimal', 'skill', 'region', 'region_core', 'region_population'] as const) {
      for (const effort of ['low', 'medium'] as const) {
        const b = bodyOf(msg({ route, effort }));
        expect(b.model).toBe('claude-sonnet-5-5');
        expect(MODEL).toBe('claude-sonnet-5-5');
        expect(b.output_config.effort).toBe(effort);
        expect(b.max_tokens).toBe(MAX_TOKENS[route]);
      }
    }
    expect(MAX_TOKENS.minimal).toBe(256);
    expect(MAX_TOKENS.skill).toBe(4096);
    expect(MAX_TOKENS.region).toBe(8192);
    expect(MAX_TOKENS.region_core).toBe(8192);
    expect(MAX_TOKENS.region_population).toBe(8192);
  });

  it('never carries parameters Sonnet 5.5 rejects', () => {
    for (const route of ['minimal', 'skill', 'region', 'region_core', 'region_population'] as const) {
      const text = buildRequest(msg({ route }), FAKE_KEY).body as string;
      const b = JSON.parse(text);
      for (const k of ['temperature', 'top_p', 'top_k', 'tool_choice']) {
        expect(k in b).toBe(false);
      }
      expect(text.includes('budget_tokens')).toBe(false);
      expect(b.messages.every((m: any) => m.role === 'user')).toBe(true);
      expect('thinking' in b).toBe(false);
    }
  });

  it('adds only { type: between_tools } as the thinking block for the exploratory variant', () => {
    const b = bodyOf(msg({ route: 'skill', effort: 'medium', thinking: 'between_tools' }));
    expect(b.thinking).toEqual({ type: 'between_tools' });
    expect(JSON.stringify(b).includes('disabled')).toBe(false);
  });

  it('sends the constant bad key for keyMode bad, which does not look like a real key', () => {
    const r = buildRequest(msg({ class: 'drill', keyMode: 'bad' }), FAKE_KEY);
    expect(r.headers['x-api-key']).toBe(BAD_KEY_VALUE);
    expect(BAD_KEY_VALUE.startsWith(KEY_PREFIX)).toBe(false);
    expect(JSON.stringify(r)).not.toContain(FAKE_KEY);
  });

  it('minimal route has no system block and no structured format', () => {
    const b = bodyOf(msg());
    expect('system' in b).toBe(false);
    expect('format' in b.output_config).toBe(false);
  });

  it('skill bodies use the real prompt builders and the mapped skill schema', () => {
    const b = bodyOf(msg({ route: 'skill', effort: 'medium' }));
    expect(b.system).toEqual([
      { type: 'text', text: buildSkillGenSystemPrompt(), cache_control: { type: 'ephemeral' } },
    ]);
    const full = buildSkillGenUserPrompt('Vessa', 'Human', 'Spellblade', 'arcane', 5n, []);
    expect(full).toContain('Respond with ONLY valid JSON');
    const expectedUser = full.slice(0, full.indexOf('Respond with ONLY valid JSON')).trim();
    expect(b.messages).toHaveLength(1);
    expect(b.messages[0].content).toBe(expectedUser);
    expect(b.messages[0].content).not.toContain('Respond with ONLY valid JSON');
    expect(b.output_config.format).toEqual({ type: 'json_schema', schema: SKILL_JSON_SCHEMA });
  });

  it('region bodies use the real prompt builders and the hand-written region schema', () => {
    const b = bodyOf(msg({ route: 'region', effort: 'low' }));
    expect(b.system).toEqual([
      { type: 'text', text: buildWorldGenPrompt(''), cache_control: { type: 'ephemeral' } },
    ]);
    const full = buildRegionGenerationUserPrompt('Human', 'Spellblade', 'arcane', 'Ashfall Reach', [
      { name: 'Cinder Steppe', biome: 'volcanic', threats: 'fire drakes' },
    ]);
    const expectedUser = full.slice(0, full.indexOf('Respond with ONLY valid JSON')).trim();
    expect(b.messages[0].content).toBe(expectedUser);
    expect(b.output_config.format).toEqual({ type: 'json_schema', schema: REGION_JSON_SCHEMA });
  });

  it('staged region routes carry the core and population schemas', () => {
    const core = bodyOf(msg({ route: 'region_core', effort: 'low' }));
    const pop = bodyOf(msg({ route: 'region_population', effort: 'low' }));
    expect(core.output_config.format.schema).toEqual(REGION_CORE_JSON_SCHEMA);
    expect(pop.output_config.format.schema).toEqual(REGION_POPULATION_JSON_SCHEMA);
  });

  it('is deterministic byte for byte (cache prefix and schema compile cache)', () => {
    const a = buildRequest(msg({ route: 'skill', effort: 'medium' }), FAKE_KEY).body;
    const c = buildRequest(msg({ route: 'skill', effort: 'medium' }), FAKE_KEY).body;
    expect(a).toBe(c);
  });

  it('reports request size and max tokens for the spend reservation', () => {
    const r = buildRequest(msg({ route: 'skill', effort: 'low' }), FAKE_KEY);
    expect(r.maxTokens).toBe(4096);
    expect(r.requestChars).toBeGreaterThan(1000);
  });
});

describe('buildRequest: non-messages kinds', () => {
  it('public_url is a keyless GET', () => {
    const r = buildRequest({ kind: 'public_url', class: 'reliability' }, FAKE_KEY);
    expect(r.url).toBe('https://example.com/');
    expect(r.method).toBe('GET');
    expect(r.headers['x-api-key']).toBeUndefined();
    expect(r.headers['anthropic-version']).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain(FAKE_KEY);
    expect(r.maxTokens).toBe(0);
  });

  it('models is a keyed GET with limit 100', () => {
    const r = buildRequest({ kind: 'models', class: 'reliability' }, FAKE_KEY);
    expect(r.url).toBe('https://api.anthropic.com/v1/models?limit=100');
    expect(r.method).toBe('GET');
    expect(r.headers['x-api-key']).toBe(FAKE_KEY);
    expect(r.headers['anthropic-version']).toBe('2023-06-01');
  });

  it('models with keyMode bad never carries the stored key', () => {
    const r = buildRequest({ kind: 'models', class: 'drill', keyMode: 'bad' }, FAKE_KEY);
    expect(r.headers['x-api-key']).toBe(BAD_KEY_VALUE);
  });

  it('noop builds no request', () => {
    const r = buildRequest({ kind: 'noop', class: 'reliability' }, FAKE_KEY);
    expect(r.url).toBe('');
    expect(r.maxTokens).toBe(0);
    expect(JSON.stringify(r)).not.toContain(FAKE_KEY);
  });
});

describe('cutBeforeJsonInstruction', () => {
  it('slices before the first instruction and trims', () => {
    expect(cutBeforeJsonInstruction('Hello there.\n\nRespond with ONLY valid JSON: {}')).toBe('Hello there.');
  });
  it('returns the trimmed text when there is no instruction', () => {
    expect(cutBeforeJsonInstruction('  plain  ')).toBe('plain');
  });
});

describe('toAnthropicSchema', () => {
  it('turns nullable type arrays into anyOf and keeps descriptions', () => {
    const out = toAnthropicSchema({ type: ['number', 'null'], description: 'Secondary' });
    expect(out).toEqual({ description: 'Secondary', anyOf: [{ type: 'number' }, { type: 'null' }] });
  });

  it('leaves no array-valued type in the mapped skill schema', () => {
    expect(hasArrayType(SKILL_JSON_SCHEMA)).toBe(false);
    const props = (SKILL_JSON_SCHEMA as any).properties.skills.items.properties;
    expect(props.value2.anyOf).toEqual([{ type: 'number' }, { type: 'null' }]);
    expect(props.effectType.anyOf).toEqual([{ type: 'string' }, { type: 'null' }]);
    expect(props.value2.description).toBeTruthy();
    expect(props.name.type).toBe('string');
  });

  it('does not mutate its input', () => {
    const input = { type: ['string', 'null'] };
    toAnthropicSchema(input);
    expect(input).toEqual({ type: ['string', 'null'] });
  });

  it('exports module-level constant schemas (same object each import)', async () => {
    const again = await import('./spike_bodies');
    expect(again.SKILL_JSON_SCHEMA).toBe(SKILL_JSON_SCHEMA);
    expect(again.REGION_JSON_SCHEMA).toBe(REGION_JSON_SCHEMA);
    expect(bodyOf(msg({ route: 'skill' })).output_config.format.schema).toEqual(SKILL_JSON_SCHEMA);
  });
});

describe('region schemas', () => {
  it('every object node forbids extra properties and requires all its properties', () => {
    for (const schema of [REGION_JSON_SCHEMA, REGION_CORE_JSON_SCHEMA, REGION_POPULATION_JSON_SCHEMA]) {
      const objects = collectObjects(schema);
      expect(objects.length).toBeGreaterThan(0);
      for (const o of objects) {
        expect(o.additionalProperties).toBe(false);
        expect([...o.required].sort()).toEqual(Object.keys(o.properties).sort());
      }
    }
  });

  it('the full schema matches the top-level keys of the real example string', () => {
    expect(Object.keys((REGION_JSON_SCHEMA as any).properties).sort()).toEqual(
      [
        'regionName',
        'regionDescription',
        'biome',
        'dominantFaction',
        'landmarks',
        'threats',
        'locations',
        'npcs',
        'enemies',
      ].sort(),
    );
  });

  it('the staged pair splits the full schema without loss', () => {
    const core = Object.keys((REGION_CORE_JSON_SCHEMA as any).properties);
    const pop = Object.keys((REGION_POPULATION_JSON_SCHEMA as any).properties);
    expect(pop.sort()).toEqual(['enemies', 'npcs']);
    expect([...core, ...pop].sort()).toEqual(Object.keys((REGION_JSON_SCHEMA as any).properties).sort());
  });

  it('has no array-valued type anywhere', () => {
    expect(hasArrayType(REGION_JSON_SCHEMA)).toBe(false);
  });
});

describe('parseResponse', () => {
  const usage = {
    input_tokens: 1200,
    output_tokens: 300,
    cache_creation_input_tokens: 1000,
    cache_read_input_tokens: 0,
  };

  function messagesBody(text: string, stop = 'end_turn', withThinking = true): string {
    const content: any[] = [];
    if (withThinking) content.push({ type: 'thinking', thinking: '' });
    content.push({ type: 'text', text });
    return JSON.stringify({ type: 'message', role: 'assistant', content, stop_reason: stop, usage });
  }

  it('reads the text block after a leading thinking block and reports usage', () => {
    const r = parseResponse(msg(), 200, messagesBody('pong'));
    expect(r.stopReason).toBe('end_turn');
    expect(r.usage).toEqual({ input: 1200, output: 300, cacheWrite: 1000, cacheRead: 0 });
    expect(r.contentOk).toBe(true);
    expect(r.anthropicErrorType).toBeNull();
    expect(r.errorMessage).toBeNull();
  });

  it('skill: parsedOk and requiredKeysOk need a non-empty skills array', () => {
    const spec = msg({ route: 'skill', effort: 'medium' });
    const good = parseResponse(spec, 200, messagesBody(JSON.stringify({ skills: [{ name: 'x' }] })));
    expect(good.parsedOk).toBe(true);
    expect(good.requiredKeysOk).toBe(true);
    expect(good.contentOk).toBe(true);

    const empty = parseResponse(spec, 200, messagesBody(JSON.stringify({ skills: [] })));
    expect(empty.parsedOk).toBe(true);
    expect(empty.requiredKeysOk).toBe(false);
    expect(empty.contentOk).toBe(false);

    const bad = parseResponse(spec, 200, messagesBody('not json'));
    expect(bad.parsedOk).toBe(false);
    expect(bad.contentOk).toBe(false);
  });

  it('region: requires every top-level key', () => {
    const spec = msg({ route: 'region', effort: 'low' });
    const full: any = {};
    for (const k of (REGION_JSON_SCHEMA as any).required) full[k] = 'x';
    expect(parseResponse(spec, 200, messagesBody(JSON.stringify(full))).requiredKeysOk).toBe(true);
    delete full.enemies;
    const missing = parseResponse(spec, 200, messagesBody(JSON.stringify(full)));
    expect(missing.parsedOk).toBe(true);
    expect(missing.requiredKeysOk).toBe(false);
    expect(missing.contentOk).toBe(false);
  });

  it('staged routes check their own required keys', () => {
    const core: any = {};
    for (const k of (REGION_CORE_JSON_SCHEMA as any).required) core[k] = 'x';
    expect(
      parseResponse(msg({ route: 'region_core' }), 200, messagesBody(JSON.stringify(core))).requiredKeysOk,
    ).toBe(true);
    expect(
      parseResponse(msg({ route: 'region_population' }), 200, messagesBody(JSON.stringify({ npcs: [], enemies: [] })))
        .requiredKeysOk,
    ).toBe(true);
  });

  it('max_tokens and refusal stops are not ok even with a body', () => {
    const spec = msg({ route: 'skill', effort: 'low' });
    const text = JSON.stringify({ skills: [{ name: 'x' }] });
    expect(parseResponse(spec, 200, messagesBody(text, 'max_tokens')).contentOk).toBe(false);
    expect(parseResponse(spec, 200, messagesBody(text, 'max_tokens')).stopReason).toBe('max_tokens');
    expect(parseResponse(spec, 200, messagesBody(text, 'refusal')).contentOk).toBe(false);
    expect(parseResponse(spec, 200, messagesBody(text, 'refusal')).stopReason).toBe('refusal');
  });

  it('401 body gives the anthropic error type and message', () => {
    const body = JSON.stringify({
      type: 'error',
      error: { type: 'authentication_error', message: 'invalid x-api-key' },
    });
    const r = parseResponse(msg(), 401, body);
    expect(r.anthropicErrorType).toBe('authentication_error');
    expect(r.errorMessage).toBe('invalid x-api-key');
    expect(r.contentOk).toBe(false);
    expect(r.usage).toBeNull();
  });

  it('caps the error message at 400 characters and redacts key-shaped strings', () => {
    const long = `bad ${FAKE_KEY} ` + 'q'.repeat(1000);
    const body = JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: long } });
    const r = parseResponse(msg(), 400, body);
    expect(r.errorMessage!.length).toBeLessThanOrEqual(400);
    expect(r.errorMessage).not.toContain(FAKE_KEY);
    expect(r.errorMessage).toContain('[REDACTED]');
  });

  it('non-json error bodies still produce a capped, redacted message', () => {
    const r = parseResponse({ kind: 'public_url', class: 'reliability' }, 503, `<html>${FAKE_KEY}</html>`);
    expect(r.anthropicErrorType).toBeNull();
    expect(r.errorMessage).not.toContain(FAKE_KEY);
  });

  it('models: modelListed only when data contains the model id', () => {
    const spec: SpikeSpec = { kind: 'models', class: 'reliability' };
    const yes = parseResponse(spec, 200, JSON.stringify({ data: [{ id: 'claude-haiku-4-5' }, { id: 'claude-sonnet-5-5' }] }));
    expect(yes.modelListed).toBe(true);
    expect(yes.contentOk).toBe(true);
    const no = parseResponse(spec, 200, JSON.stringify({ data: [{ id: 'claude-haiku-4-5' }] }));
    expect(no.modelListed).toBe(false);
    expect(no.contentOk).toBe(true);
  });

  it('public_url 200 is ok and noop is trivially ok', () => {
    expect(parseResponse({ kind: 'public_url', class: 'reliability' }, 200, '<html/>').contentOk).toBe(true);
    expect(parseResponse({ kind: 'noop', class: 'reliability' }, 0, '').contentOk).toBe(true);
  });

  it('an unparseable 200 messages body is a content failure', () => {
    const r = parseResponse(msg(), 200, 'garbage');
    expect(r.contentOk).toBe(false);
    expect(r.parsedOk).toBe(false);
  });
});
