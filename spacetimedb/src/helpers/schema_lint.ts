// ============================================================================
// Structured-output JSON Schema subset linter (pure, dependency-free)
// ============================================================================
//
// Anthropic structured outputs (output_config.format) accept only a subset of
// JSON Schema. lintSchema() reports every construct outside that subset so a
// schema that would 400 (or silently degrade) is caught offline, in tests.
//
// Property KEYS are data, never keywords: a property literally called "name"
// is legal. Only schema nodes are inspected for keywords.
// ============================================================================

export const SCHEMA_MAX_OPTIONAL_PARAMS = 24;
export const SCHEMA_MAX_UNION_PARAMS = 16;

export const SUPPORTED_STRING_FORMATS = [
  'date-time',
  'time',
  'date',
  'duration',
  'email',
  'hostname',
  'uri',
  'ipv4',
  'ipv6',
  'uuid',
] as const;

const UNSUPPORTED_BOUND_KEYWORDS = [
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
] as const;

type Json = any;

function isObj(x: unknown): x is Record<string, Json> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isObjectNode(node: Record<string, Json>): boolean {
  return node.type === 'object' || isObj(node.properties);
}

/** Visit every schema node (not property keys) with its JSON-pointer-style path. */
function forEachNode(
  node: Json,
  path: string,
  visit: (node: Record<string, Json>, path: string) => void,
): void {
  if (!isObj(node)) return;
  visit(node, path);
  if (isObj(node.properties)) {
    for (const [k, v] of Object.entries(node.properties)) forEachNode(v, `${path}/properties/${k}`, visit);
  }
  if (isObj(node.items)) forEachNode(node.items, `${path}/items`, visit);
  if (Array.isArray(node.anyOf)) {
    node.anyOf.forEach((m: Json, i: number) => forEachNode(m, `${path}/anyOf/${i}`, visit));
  }
  for (const defsKey of ['$defs', 'definitions']) {
    if (isObj(node[defsKey])) {
      for (const [k, v] of Object.entries(node[defsKey])) forEachNode(v, `${path}/${defsKey}/${k}`, visit);
    }
  }
}

/** Optional parameters: properties absent from `required`, summed over every object node. */
export function countOptionalParams(schema: unknown): number {
  let count = 0;
  forEachNode(schema, '', (node) => {
    if (!isObj(node.properties)) return;
    const required = new Set<string>(Array.isArray(node.required) ? node.required : []);
    for (const key of Object.keys(node.properties)) if (!required.has(key)) count++;
  });
  return count;
}

/** Union parameters: property definitions that use `anyOf`, counted once per definition. */
export function countUnionParams(schema: unknown): number {
  let count = 0;
  forEachNode(schema, '', (node) => {
    if (!isObj(node.properties)) return;
    for (const def of Object.values(node.properties)) {
      if (isObj(def) && Array.isArray(def.anyOf)) count++;
    }
  });
  return count;
}

function refTarget(ref: string): string | null {
  const m = /^#\/(?:\$defs|definitions)\/([^/]+)$/.exec(ref);
  return m ? m[1] : null;
}

/** Names of $defs/definitions entries that reach themselves through $ref. */
function recursiveDefs(schema: Record<string, Json>): string[] {
  const defs: Record<string, Json> = {};
  for (const defsKey of ['$defs', 'definitions']) {
    if (isObj(schema[defsKey])) Object.assign(defs, schema[defsKey]);
  }
  const graph: Record<string, Set<string>> = {};
  for (const [name, def] of Object.entries(defs)) {
    const targets = new Set<string>();
    forEachNode(def, '', (node) => {
      if (typeof node.$ref === 'string') {
        const t = refTarget(node.$ref);
        if (t !== null) targets.add(t);
      }
    });
    graph[name] = targets;
  }
  const recursive: string[] = [];
  for (const name of Object.keys(graph)) {
    const seen = new Set<string>();
    const stack = [...graph[name]];
    let hit = false;
    while (stack.length) {
      const cur = stack.pop() as string;
      if (cur === name) {
        hit = true;
        break;
      }
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const next of graph[cur] ?? []) stack.push(next);
    }
    if (hit) recursive.push(name);
  }
  return recursive;
}

/** Returns a list of problems, each `<path>: <message>`. An empty array means the schema passes. */
export function lintSchema(schema: unknown): string[] {
  const problems: string[] = [];
  const add = (path: string, msg: string) => problems.push(`${path === '' ? '/' : path}: ${msg}`);

  // Rule 10 (and the wrapper check of rule 8) on the root.
  if (!isObj(schema)) {
    add('', 'root must be a schema object');
    return problems;
  }
  if ('json_schema' in schema) add('', 'top-level json_schema wrapper is not allowed (send the bare schema)');
  if (schema.type !== 'object') add('', "root must have type 'object'");
  if (!Array.isArray(schema.required)) add('', 'root must have a required array');

  forEachNode(schema, '', (node, path) => {
    // 1. objects must close additionalProperties
    if (isObjectNode(node) && node.additionalProperties !== false) {
      add(path, 'object must set additionalProperties: false');
    }
    // 2. type arrays, nullable, oneOf
    if (Array.isArray(node.type)) add(path, 'array-valued type is not supported (use anyOf)');
    if ('nullable' in node) add(path, 'nullable is not supported (use anyOf with null)');
    if ('oneOf' in node) add(path, 'oneOf is not supported (use anyOf)');
    // 3. numeric and string bounds
    for (const kw of UNSUPPORTED_BOUND_KEYWORDS) {
      if (kw in node) add(path, `${kw} is not supported`);
    }
    // 4. array bounds
    if ('minItems' in node && node.minItems !== 0 && node.minItems !== 1) {
      add(path, 'minItems other than 0 or 1 is not supported');
    }
    if ('maxItems' in node) add(path, 'maxItems is not supported');
    // 5. $ref must be internal
    if (typeof node.$ref === 'string' && !node.$ref.startsWith('#/')) {
      add(path, `external $ref is not supported (${node.$ref})`);
    }
    // 6. enum members must be scalars
    if (Array.isArray(node.enum)) {
      for (const m of node.enum) {
        if (typeof m === 'object' && m !== null) add(path, 'enum members must not be objects or arrays');
      }
    }
    // 7. formats
    if ('format' in node && !(SUPPORTED_STRING_FORMATS as readonly string[]).includes(node.format)) {
      add(path, `unsupported format ${JSON.stringify(node.format)}`);
    }
    // 8. leftover OpenAI wrapper keywords on a schema node
    if ('name' in node && typeof node.name === 'string') add(path, 'name is an OpenAI wrapper key, not a schema keyword');
    if ('strict' in node) add(path, 'strict is an OpenAI wrapper key, not a schema keyword');
  });

  // 5. recursion through $ref
  for (const name of recursiveDefs(schema)) add(`/$defs/${name}`, 'recursive $ref is not supported');
  if (JSON.stringify(schema).includes('"$ref":"#"')) add('', 'recursive $ref to the root is not supported');

  // 9. counts
  const optional = countOptionalParams(schema);
  if (optional > SCHEMA_MAX_OPTIONAL_PARAMS) {
    add('', `${optional} optional parameters exceeds the limit of ${SCHEMA_MAX_OPTIONAL_PARAMS}`);
  }
  const unions = countUnionParams(schema);
  if (unions > SCHEMA_MAX_UNION_PARAMS) {
    add('', `${unions} union parameters exceeds the limit of ${SCHEMA_MAX_UNION_PARAMS}`);
  }

  return problems;
}
