# @uwr/prompt-schema

This package contains Zod schemas, PromptTemplate helpers, and sample templates used by the Unwritten Realms orchestrator.

## What is a PromptTemplate
A PromptTemplate defines a reusable prompt string with metadata that the orchestrator and clients can share. It is intended to be validated with the `PromptTemplate` Zod schema exported from `src/schemas/templates.ts`.

Minimal fields:
- `id` (string): unique identifier for the template (e.g. `greet_npc_v1`).
- `version` (semver-like string): release version for template upgrades (e.g. `0.1.0`).
- `name` (string): human-friendly name.
- `description` (string, optional): short description of the template's purpose.
- `template` (string): the template text containing placeholders like `{{playerName}}`.
- `outputSchemaRef` (string, optional): a reference to which output schema (e.g., `narrative:v1`) the model should produce.

Prompt placeholders
- Placeholders use curly braces: `{{playerName}}`, `{{npcName}}`, etc.
- The orchestrator includes `extractPlaceholders` to enumerate tokens and the `validateTemplatePlaceholders` helper to ensure at least one placeholder exists.

## Effect detail (important)
For any structured `effects` emitted by the model inside `resolution.effects`, the orchestrator requires `effect.detail` to be valid JSON (this is enforced at runtime):

Supported JSON shapes for `effect.detail`:
1. Array: an ordered list of arguments passed to the reducer. Example:

```json
["player:123", 5]
```

2. Object: explicit reducer selection and arguments. Example:

```json
{ "reducer": "upsert_account", "args": ["supabase", "1234", "Alice"] }
```

Notes
- Do not use pipe-delimited strings or free-form text for `effect.detail` — these are no longer supported.
- The orchestrator maps `effect.type` to likely reducer names and will attempt to call remote reducers when `SPACETIME_ENABLED=true`.

## Generating JSON Schemas
This package contains a script to export Zod schemas to JSON Schema files under `generated/schemas`:

From the repo root:

```bash
pnpm exec tsx packages/prompt-schema/scripts/generate-json-schemas.ts
```

The orchestrator loads generated schemas at startup for AJV validation.

## Sample templates
- `src/templates/greet-npc.ts` — simple greeting template used by tests and examples.

## Contributing
Keep templates backwards-compatible where possible. Update the `version` field when changing template placeholders or expected output shapes.

*** End of README
