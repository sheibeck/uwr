# Prompt Schema Plan

Purpose
- Define a stable, versioned schema for prompts, function calls, and expected AI outputs used by the orchestrator. This schema will:
  - Ensure prompts and function-call payloads are consistent across orchestrator and client.
  - Provide validation rules (Zod/JSON Schema) so the AI responses can be validated and gated before performing actions.
  - Tie prompts to the lore knowledge base so content and constraints align with game canon.

Core concepts
- PromptTemplate: reusable template (string) with placeholders and metadata.
- PromptContext: runtime inputs (player state, world state, NPC state, conversation history).
- ActionSchema: definition of function-call arguments, types, and validation rules (zod + json-schema).
- ResponseSchema: expected AI output structure (choices/intent/actions) and validation rules.

File layout (docs + code)
- docs/prompt-schema-plan.md (this file)
- packages/prompt-schema/ (package exporting Zod schemas + json-schema artifacts)
  - src/
    - templates.ts (PromptTemplate types + helpers)
    - context.ts (PromptContext types)
    - action.ts (ActionSchema zod types)
    - response.ts (ResponseSchema zod types)
    - index.ts (exports)
  - package.json

Design goals
- Versioned: `PromptTemplate` and `ActionSchema` include `version` metadata so orchestrator can handle upgrades.
- Reusable: templates are parameterized and stored with metadata like "temperature", "max_tokens", and "safetyProfile".
- Validated: every AI action is validated against `ActionSchema` before being dispatched to the database.

Minimal initial schema
- PromptTemplate
  - id: string
  - version: string
  - name: string
  - description: string
  - template: string (must include placeholder tokens like {{playerName}})
  - outputSchemaRef?: string

- ActionSchema (Zod)
  - id: string
  - version: string
  - name: string
  - description: string
  - args: Zod schema for structured args
  - allowedEffects: array of strings (what game entities it may change)

Integration with lore knowledge base
- The orchestrator will load `docs/lore/*.yaml` into a read-only knowledge graph.
- Prompt templates may reference canonical lore snippets by id; prompt builder will inject the relevant canonical text into the `PromptContext`.
- A small preprocessor will expand lore references to concise, relevant snippets to avoid sending excessive context to the model.

Next tasks (implementation)
1. Create `packages/prompt-schema` with Zod schema files and unit tests.
2. Add generator to export JSON Schema files and TypeScript types (use `zod-to-json-schema`).
3. Wire the orchestrator's Prompt Builder to load templates and validate outputs using the generated JSON schemas.
4. Add documentation and sample templates in `docs/prompts/` showing example usage with lore references.

Examples
- See `docs/prompts/example-npc-action.md` (TODO) for a minimal end-to-end template + action schema.

Security and safety notes
- All prompts and response schemas must be validated; any response failing validation is rejected and routed to a human-in-the-loop queue.
- Do not expose raw lore source that may contain PII or admin secrets to the model inputs.


---
Generated on: 2025-11-18
