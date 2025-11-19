# shared-schema

This package holds shared Zod schemas and TypeScript types used across the monorepo.

Exported types/schemas:

- `NarrativeResponse` (Zod schema and TypeScript type)
  - Shape:
    - `narration: string`
    - `diegeticMessages: any[]`
    - `resolution?: { success: boolean }`
    - `loreRefsUsed: any[]`
    - `safetyFlags: any[]`
  - Use this type for AI-generated narrative payloads returned by model adapters.

- `ActionEnvelope` and `CharacterId` (from `src/index.ts`)

Usage:

In TypeScript files within the workspace you can import via the `@shared` path alias:

```ts
import { NarrativeResponse } from '@shared/narrative';
```

This package is private and meant for workspace-local sharing; its types are re-exported from `src/index.ts`.
