# Phase 38: Platform Upgrade - Pattern Map

**Mapped:** 2026-09-29
**Files analyzed:** 14 (lean, version-upgrade phase)
**Analogs found:** 12 / 14 (the two docs edits need none)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `spacetimedb/src/reducers/intent.test.ts` (fix lines 40, 197) | test | transform | itself + `spacetimedb/src/helpers/look.ts:14` | exact |
| optional new `spacetimedb/src/reducers/scheduled_idempotency.test.ts` | test | event-driven | `spacetimedb/src/helpers/test-utils.test.ts`, `intent.test.ts` | role-match |
| `src/App.vue` (vue-tsc fixes) | component | request-response | see error categories below | n/a |
| `src/components/CharacterInfoPanel.vue` (old ability shape) | component | transform | `AbilityTemplate` in `src/module_bindings/types.ts:22-44` | exact |
| `src/components/NarrativeConsole.vue`, `NarrativeHotbar.vue`, `src/composables/useHotbar.ts` (`HotbarDisplaySlot` x3) | component/composable | transform | `useHotbar.ts:13` (fullest shape) | exact |
| `package.json` (root) | config | n/a | current root package.json | exact |
| `spacetimedb/package.json` | config | n/a | current file | exact |
| `llm-proxy/package.json` | config | n/a | current file | exact |
| `spacetimedb/pnpm-workspace.yaml`, `llm-proxy/pnpm-workspace.yaml` (new) | config | n/a | none (see RESEARCH Code Examples) | no analog |
| `CLAUDE.md` and `AGENTS.md` | docs | n/a | byte-identical copies, edit both | n/a |
| `src/main.ts` (optional log-only change) | config | event-driven | itself | exact |

## Pattern Assignments

### Test conventions (applies to the buildLookOutput fix and any new tests)

**Analog:** `spacetimedb/src/reducers/intent.test.ts` (co-located `*.test.ts`, shared `createMockDb` from `../helpers/test-utils`).

**Imports and mock pattern** (lines 1-17):
```typescript
import { describe, it, expect, vi } from 'vitest';
vi.mock('../helpers/npc_affinity', () => ({ getAffinityForNpc: () => 0n }));
vi.mock('../helpers/location', () => ({
  getWorldState: (ctx: any) => ctx.db.world_state.id.find(1n),
}));
import { buildLookOutput } from '../helpers/look';
import { createMockDb } from '../helpers/test-utils';
```

**Ctx construction** (lines 32-37): `const ctx = { db, timestamp: { microsSinceUnixEpoch: 1000000000000n } };`. Alternative: `createMockCtx({ seed, sender, timestampMicros })` at `helpers/test-utils.ts:116-126`. Prefer `createMockCtx` for new tests. `createMockDb(seed)` takes snake_case table-name keys and tracks `id`/`scheduledId` for auto-increment (`test-utils.ts:9-25`).

**Fix for the 2 failing tests.** The source emits the color tag at `spacetimedb/src/helpers/look.ts:14`:
```typescript
parts.push(`{{color:#fbbf24}}${location.name}{{/color}}`);
```
- Line 40: change `expect(parts[0]).toBe('Test Town')` to `expect(parts[0]).toBe('{{color:#fbbf24}}Test Town{{/color}}')`.
- Line 197: same change for `'Town'`.
- Alternative: strip tags with `.replace(/\{\{\/?color[^}]*\}\}/g, '')` and keep the bare name. Do not change `look.ts`.

**Optional idempotency test** (`tick_day_night`, `disconnect_logout`, `character_logout`): reducers are registered in `spacetimedb/src/index.ts` and `spacetimedb/src/reducers/auth.ts`. Copy the `vi.mock` plus `createMockCtx` structure above. Call the handler twice, or in reversed order, and assert the same final table state. Existing tests import helpers directly, so export or extract the handler body if it is not reachable. A pure bump does not require this test.

**Vitest 5:** there is no `vitest.config.*` in the root or in `spacetimedb/`. The root `vitest run` also collects `spacetimedb/src/**/*.test.ts` (18 files). It needs `spacetimedb/node_modules` installed. Baseline is 476/478 in `spacetimedb/` and 507/509 at the root, and the fix should bring both to full pass.

---

### vue-tsc error categories (`src/App.vue` and components)

**Category A: unused declarations (109 x TS6133, 1 x TS6196).** Mostly unused destructured composable returns in `App.vue` (e.g. the `const { ..., isCasting, ... } = useX(...)` blocks around lines 2376-2432). Delete the unused bindings and do NOT relax `noUnused*` in `tsconfig.json`. Deleting bindings does not change behavior, but check each is not used in the template before removing it. `noUnusedLocals` counts `<template>` usage.

**Category B: `HotbarDisplaySlot` declared 3 times, causing new `TS2719` at `App.vue:87`.** The three local definitions differ:
- `src/composables/useHotbar.ts:13-23` (fullest): `slot, abilityTemplateId, name, description, resourceType, kind, levelRequired, cooldownSeconds, cooldownRemaining`. It has no `abilityKey` or `isCasting`.
- `src/components/NarrativeHotbar.vue:59-66`: `slot, abilityTemplateId, name, cooldownRemaining, cooldownSeconds, isCasting?`.
- `src/components/NarrativeConsole.vue:144-150`: `slot, abilityTemplateId, name, cooldownRemaining, cooldownSeconds`.

Canonical fix: `export type HotbarDisplaySlot` in `useHotbar.ts` (or a small shared types module), and `import type` it in both components. Keep `isCasting?` optional. The `App.vue:2657` `abilityKey` error suggests the canonical type or a consumer needs `abilityKey`. `AbilityTemplate.abilityKey` is `string | undefined` (`module_bindings/types.ts:43`), so fix deliberately, not by blanket cast. In `.vue` `<script setup>`, `import type { X } from '../composables/useHotbar'` is fine.

**Category C: `CharacterInfoPanel.vue` (7 errors) uses the OLD ability shape.** The panel prop is already the NEW shape (`CharacterInfoPanel.vue:218`):
```typescript
availableAbilities: { key: string; name: string; description: string; resource: string; kind: string; level: bigint; castSeconds: bigint; cooldownSeconds: bigint; resourceCost: bigint; damageType?: string | null }[];
```
The template and handler still use the old fields: line 122 `:key="ability.id"`, line 128 `ability.levelRequired`, line 130 `ability.resourceType`, line 264 `showContextMenu(event, ability: { id; ...; resourceType; levelRequired })`, and lines 256-269 `abilityTemplateId: ability.id`, `resourceType`. Mapping is `id -> key`, `levelRequired -> level`, `resourceType -> resource`. Beware: the emit is `add-ability-to-hotbar(abilityTemplateId: bigint, ...)` (line 237), but the new shape has a string `key` and no bigint id. This is a possible latent runtime bug, so the executor must check what `App.vue` passes as `availableAbilities` (search `availableAbilities` at `App.vue:2376`, from a composable) and how `add-ability-to-hotbar` is consumed. The authoritative table type is `AbilityTemplate` in `src/module_bindings/types.ts:22-44` (`id: u64`, `levelRequired`, `resourceType`, `abilityKey: option<string>`). Escalate to the user if the fix changes behavior (RESEARCH Open Question 1).

**Category D: real type errors in `App.vue` (14).**
- `EventTarget` typing in template handlers at lines 117/118/305/306: cast `(e.target as HTMLInputElement)` inside a script function, not inline.
- `boolean | null` at line 99: coalesce with `?? false`.
- unknown `races` / `inventoryItems` args at lines 782 and 2420.
- implicit any at lines 861/862.
- `string` vs `bigint` at lines 2516 and 2574 (latent bug candidate).
- `abilityKey` at line 2657.

**Category E: `NarrativeConsole.vue` (5), `undefined` vs `null` prop types.** Align prop types to the bindings' optional (`foo?:`) fields after regeneration. Also `useCombat.ts:184`, which is fixed by regenerating the bindings.

Sequence: do Wave 0 fixes on the CURRENT toolchain (target 0 errors), then re-verify after TS 6 / vue-tsc 3 (RESEARCH predicts a subset).

---

### package.json / pnpm config conventions

**Root `package.json`** (`"type": "module"`, `"private": true`, caret ranges, scripts `dev/build/preview/spacetime:generate/spacetime:publish/spacetime:publishprod`). Current `build` is `vue-tsc -b && vite build`. Edits per RESEARCH: add `"engines": {"node": ">=22.12"}`, add `"test": "vitest run"` after `preview`, and bump `spacetimedb ^2.10.1`, `vue ^3.5.43`, `@vitejs/plugin-vue ^6.0.9`, `typescript ~6.0.3` (tilde, keep it), `vite ^8.3.1`, `vitest ^5.0.2`, `vue-tsc ^3.3.11`. Keep `@types/node ^25.2.3` and `html2canvas ^1.4.1`. Do not touch `spacetime:publishprod`.

**`spacetimedb/package.json`** (name `"uwr"` duplicates the root, and the `build`, `publish`, `test: vitest run` scripts stay): bump `spacetimedb ^2.10.1`, `vitest ^5.0.2`. Do NOT add `typescript`. It would turn on the `spacetime build` tsc gate (233 pre-existing errors, exit 2).

**`llm-proxy/package.json`** (name `uwr-llm-proxy`, scripts `dev/deploy/secret:*`): `hono ^4.13.0`, `openai ^7.0.0`, `@cloudflare/workers-types ^5.20260926.1`, `wrangler ^4.140.0`. Leave `compatibility_date` unchanged. Never run `deploy`.

**pnpm settings** live in `pnpm-workspace.yaml`, not in `package.json` (pnpm 11). Use the contents from RESEARCH Code Examples: `allowBuilds: {esbuild: true, workerd: true}` for `llm-proxy/`, and `minimumReleaseAgeExclude: []` for `spacetimedb/`. Neither directory is a workspace, so there is no `packages:` key. Delete `node_modules` and `package-lock.json` in each directory before the first pnpm install. The root has no `pnpm-workspace.yaml` (do not add one).

---

## Shared Patterns

### Safety and per-step verification
Source: CONTEXT.md and RESEARCH.md. After each bump run `pnpm build`, `pnpm exec vitest run` (root), and `pnpm test` in `spacetimedb/`. Commit per step. No `git push`, no maincloud, no `wrangler deploy`, and no `--clear-database`. Local publish is `spacetime publish uwr -p spacetimedb --server local --break-clients`.

### Generated code
`src/module_bindings/` is regenerated only, via `pnpm spacetime:generate`. Expect a 15-file diff. The stale `client/src/module_bindings/` is left alone.

### Docs edits
Apply identical edits to `CLAUDE.md` and `AGENTS.md` (see RESEARCH.md stale-rule inventory). Keep them surgical.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `spacetimedb/pnpm-workspace.yaml`, `llm-proxy/pnpm-workspace.yaml` | config | No pnpm config files exist in the repo; use the RESEARCH.md snippets. |
| CLAUDE.md / AGENTS.md edits | docs | Textual edits per the RESEARCH.md inventory. |

## Metadata

**Analog search scope:** `spacetimedb/src/helpers`, `spacetimedb/src/reducers`, `src/components`, `src/composables`, `src/module_bindings/types.ts`, the three `package.json` files.
**Pattern extraction date:** 2026-09-29
