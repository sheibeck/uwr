import { describe, it, expect } from 'vitest';
import {
  lintSchema,
  countOptionalParams,
  countUnionParams,
  SCHEMA_MAX_OPTIONAL_PARAMS,
  SCHEMA_MAX_UNION_PARAMS,
} from './schema_lint';

// ============================================================================
// Fixtures
// ============================================================================

const S = { type: 'string' };

/** A valid root wrapping the given property definitions (all required). */
function root(props: Record<string, any>, extra: Record<string, any> = {}): any {
  return {
    type: 'object',
    properties: props,
    required: Object.keys(props),
    additionalProperties: false,
    ...extra,
  };
}

const VALID = root({ a: S });

describe('lintSchema positives', () => {
  it('passes a minimal valid root', () => {
    expect(lintSchema(VALID)).toEqual([]);
  });

  it('passes an empty-properties object with required [] and additionalProperties false', () => {
    expect(
      lintSchema({ type: 'object', properties: {}, required: [], additionalProperties: false }),
    ).toEqual([]);
  });

  it('does not flag a property literally named "name" or "strict"', () => {
    expect(lintSchema(root({ name: S, strict: S }))).toEqual([]);
  });

  it.each([0, 1])('passes minItems %i', (n) => {
    expect(lintSchema(root({ xs: { type: 'array', items: S, minItems: n } }))).toEqual([]);
  });

  it('passes format date-time', () => {
    expect(lintSchema(root({ at: { type: 'string', format: 'date-time' } }))).toEqual([]);
  });

  it('passes an internal non-recursive $ref', () => {
    const schema = root(
      { a: { $ref: '#/$defs/Leaf' } },
      { $defs: { Leaf: root({ v: S }) } },
    );
    expect(lintSchema(schema)).toEqual([]);
  });

  it('passes anyOf with a null member', () => {
    expect(lintSchema(root({ a: { anyOf: [S, { type: 'null' }] } }))).toEqual([]);
  });
});

describe('lintSchema negatives (one fixture per rule)', () => {
  const negatives: Array<[string, any, RegExp]> = [
    [
      'object without additionalProperties',
      { type: 'object', properties: { a: S }, required: ['a'] },
      /additionalProperties/,
    ],
    [
      'additionalProperties true',
      { type: 'object', properties: { a: S }, required: ['a'], additionalProperties: true },
      /additionalProperties/,
    ],
    [
      'additionalProperties a schema',
      { type: 'object', properties: { a: S }, required: ['a'], additionalProperties: S },
      /additionalProperties/,
    ],
    [
      'nested object without additionalProperties',
      root({ inner: { type: 'object', properties: {}, required: [] } }),
      /\/properties\/inner: .*additionalProperties/,
    ],
    ['array-valued type', root({ a: { type: ['number', 'null'] } }), /array-valued type/],
    ['nullable', root({ a: { type: 'string', nullable: true } }), /nullable/],
    ['oneOf', root({ a: { oneOf: [S, { type: 'number' }] } }), /oneOf/],
    ['minimum', root({ a: { type: 'number', minimum: 0 } }), /minimum/],
    ['maximum', root({ a: { type: 'number', maximum: 9 } }), /maximum/],
    ['exclusiveMinimum', root({ a: { type: 'number', exclusiveMinimum: 0 } }), /exclusiveMinimum/],
    ['exclusiveMaximum', root({ a: { type: 'number', exclusiveMaximum: 9 } }), /exclusiveMaximum/],
    ['multipleOf', root({ a: { type: 'number', multipleOf: 2 } }), /multipleOf/],
    ['minLength', root({ a: { type: 'string', minLength: 1 } }), /minLength/],
    ['maxLength', root({ a: { type: 'string', maxLength: 5 } }), /maxLength/],
    ['pattern', root({ a: { type: 'string', pattern: '^a' } }), /pattern/],
    ['minItems 2', root({ a: { type: 'array', items: S, minItems: 2 } }), /minItems/],
    ['maxItems', root({ a: { type: 'array', items: S, maxItems: 3 } }), /maxItems/],
    ['external $ref', root({ a: { $ref: 'https://example.com/x.json' } }), /external \$ref/],
    [
      'recursive $ref',
      root(
        { a: { $ref: '#/$defs/Node' } },
        { $defs: { Node: root({ child: { $ref: '#/$defs/Node' } }) } },
      ),
      /recursive \$ref/,
    ],
    [
      'mutually recursive $ref',
      root(
        { a: { $ref: '#/$defs/A' } },
        {
          $defs: {
            A: root({ b: { $ref: '#/$defs/B' } }),
            B: root({ a: { $ref: '#/$defs/A' } }),
          },
        },
      ),
      /recursive \$ref/,
    ],
    ['enum with an object member', root({ a: { enum: ['x', { y: 1 }] } }), /enum members/],
    ['enum with an array member', root({ a: { enum: ['x', [1]] } }), /enum members/],
    ['unsupported format', root({ a: { type: 'string', format: 'color' } }), /unsupported format/],
    ['name keyword on a node', root({ a: { type: 'string', name: 'thing' } }), /name is an OpenAI wrapper key/],
    ['strict keyword', root({ a: { type: 'string', strict: true } }), /strict is an OpenAI wrapper key/],
    [
      'top-level json_schema wrapper',
      { json_schema: { name: 'x', strict: true, schema: VALID } },
      /json_schema wrapper/,
    ],
    ['non-object root', { type: 'array', items: S }, /root must have type 'object'/],
    [
      'root without required',
      { type: 'object', properties: { a: S }, additionalProperties: false },
      /root must have a required array/,
    ],
  ];

  it.each(negatives)('%s', (_label, schema, pattern) => {
    const problems = lintSchema(schema);
    expect(problems.length).toBeGreaterThanOrEqual(1);
    expect(problems.some((p) => pattern.test(p))).toBe(true);
  });

  it('reports a JSON-pointer style path', () => {
    const problems = lintSchema(root({ skills: { type: 'array', items: { type: 'object', properties: {}, required: [] } } }));
    expect(problems).toContain('/properties/skills/items: object must set additionalProperties: false');
  });

  it('rejects a non-object root value', () => {
    expect(lintSchema(null).length).toBe(1);
    expect(lintSchema('x').length).toBe(1);
  });
});

describe('parameter-count limits', () => {
  /** Root with `required` listing only the first `requiredCount` properties. */
  function withOptional(total: number, optional: number): any {
    const props = Object.fromEntries(Array.from({ length: total }, (_v, i) => [`p${i}`, S]));
    return {
      type: 'object',
      properties: props,
      required: Object.keys(props).slice(0, total - optional),
      additionalProperties: false,
    };
  }

  function withUnions(n: number): any {
    const props = Object.fromEntries(
      Array.from({ length: n }, (_v, i) => [`u${i}`, { anyOf: [S, { type: 'null' }] }]),
    );
    return root(props);
  }

  it('limits are 24 optional and 16 union', () => {
    expect(SCHEMA_MAX_OPTIONAL_PARAMS).toBe(24);
    expect(SCHEMA_MAX_UNION_PARAMS).toBe(16);
  });

  it('passes exactly 24 optional parameters', () => {
    const s = withOptional(24, 24);
    expect(countOptionalParams(s)).toBe(24);
    expect(lintSchema(s)).toEqual([]);
  });

  it('fails 25 optional parameters', () => {
    const s = withOptional(25, 25);
    expect(countOptionalParams(s)).toBe(25);
    const problems = lintSchema(s);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/25 optional parameters/);
  });

  it('passes exactly 16 union parameters', () => {
    const s = withUnions(16);
    expect(countUnionParams(s)).toBe(16);
    expect(lintSchema(s)).toEqual([]);
  });

  it('fails 17 union parameters', () => {
    const s = withUnions(17);
    expect(countUnionParams(s)).toBe(17);
    const problems = lintSchema(s);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/17 union parameters/);
  });

  it('counts a union inside an array item once (per definition, not per element)', () => {
    const s = root({ xs: { type: 'array', items: withUnions(3) } });
    expect(countUnionParams(s)).toBe(3);
  });

  it('counts optional parameters across nested objects', () => {
    const s = root({ inner: withOptional(4, 2) });
    expect(countOptionalParams(s)).toBe(2);
  });
});
