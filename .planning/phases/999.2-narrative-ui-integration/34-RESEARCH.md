# Phase 34: Narrative UI Integration - Research

**Researched:** 2026-03-10
**Domain:** SpacetimeDB TypeScript — narrative command parsing, hotbar schema, Vue component UI
**Confidence:** HIGH

## Summary

Phase 34 integrates item selling, hotbar management, and event styling into the existing narrative console. The architecture is already mostly in place: `sell <item>` logic exists in `intent.ts`, `sell_all_junk` and `sell_item` reducers exist in `items.ts`, the `HotbarSlot` table exists, `useHotbar.ts` manages hotbar state, and `NarrativeMessage.vue` has a `KIND_COLORS` map waiting to be extended. The work is primarily: (1) wiring bulk sell commands in `intent.ts`, (2) adding multiple-hotbar support to schema + server + client, (3) surfacing the hotbar persistently in the NarrativeConsole layout instead of only inside the FloatingPanel, and (4) filling in missing color mappings.

The expanded user requirements (multiple named hotbars, arrow navigation, persistent visibility, out-of-combat ability use) require a schema change to add a `Hotbar` table alongside `HotbarSlot`. The current schema stores slots for a single hotbar per character. A new `Hotbar` table (`id`, `characterId`, `name`, `slotIndex`, `isActive`) is needed.

**Primary recommendation:** Extend the server schema first, then update intent.ts for sell+hotbar commands, then refactor the client to render the persistent hotbar bar inside `NarrativeConsole`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NARR-01 | User can sell items via narrative command (`sell <item>`) | Already partially implemented in intent.ts (lines 887-948) — needs perk bonus to be applied (sell_item reducer has it, intent.ts shortcut does not) |
| NARR-02 | User can sell in bulk (`sell all junk`, `sell 3 <item>`) | `sell all junk` case missing from intent.ts; `sell_all_junk` reducer exists on server and does not apply the perk bonus either |
| NARR-03 | Hotbar displays inline in narrative combat HUD with ability slots and cooldown state | `useHotbar.ts` has full cooldown logic; hotbar currently lives in FloatingPanel only; must move/duplicate into NarrativeConsole layout |
| NARR-04 | User can manage hotbar via narrative commands (`hotbar set 1 <ability>`, `hotbar swap 1 3`) | No hotbar commands exist in intent.ts; `set_hotbar_slot` reducer exists but no swap reducer |
| NARR-05 | Event feed entries are styled by kind (combat=red, reward=gold, system=gray, social=blue) | `KIND_COLORS` in NarrativeMessage.vue has all keys; requirements say "social=blue" but `say` is already `#e9ecef` and `whisper` is `#74c0fc`; needs audit + add missing kinds |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SpacetimeDB TypeScript SDK | 1.11.x | Table schema, reducers, subscriptions | Project standard |
| Vue 3 (Composition API) | 3.x | Client components, reactivity | Project standard |
| Vitest | project version | Unit tests | Already configured, used in all phases |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `spacetimedb/server` — `table`, `t`, `schema` | 1.11.x | Defining new DB tables | Adding `Hotbar` table |
| `spacetimedb/vue` — `useReducer` | 1.11.x | Calling reducers from Vue | Hotbar management composable |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `Hotbar` table for named hotbars | Add `hotbarName`/`hotbarIndex` columns to existing `HotbarSlot` | Cleaner with a parent table but either approach works; parent table is cleaner for listing named hotbars |
| Inline hotbar in NarrativeConsole | Keep FloatingPanel hotbar, also add it to NarrativeConsole | Duplication; better to render it in NarrativeConsole and drop the old floating panel or keep both surfaced from same composable data |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure
```
spacetimedb/src/schema/tables.ts          — add Hotbar table
spacetimedb/src/reducers/items.ts         — add swap_hotbar_slots, update sell_all_junk with perk bonus
spacetimedb/src/reducers/intent.ts        — add sell all junk, sell N <item>, hotbar commands
src/composables/useHotbar.ts              — extend for multiple hotbars
src/components/NarrativeHud.vue           — add persistent hotbar row below name bar
src/components/NarrativeMessage.vue       — confirm/extend KIND_COLORS
```

### Pattern 1: sell all junk in intent.ts (matching existing sell pattern)
**What:** Add `sell all junk` before the existing `sell <item>` branch (so it doesn't fall through to the partial-match path). Also add `sell <N> <item>` for bulk quantity sells.
**When to use:** Any time a user types a sell command in the narrative console.
**Example:**
```typescript
// Before existing "sell <item>" block, in the sell section of submit_intent:

// --- SELL ALL JUNK ---
if (lower === 'sell all junk' || lower === 'sell junk') {
  const npcsAtLoc = [...ctx.db.npc.by_location.filter(character.locationId)];
  const vendorNpc = npcsAtLoc.find((n: any) => n.npcType === 'vendor');
  if (!vendorNpc) return fail(ctx, character, 'There is no vendor here.');

  let total = 0n;
  const soldNames: string[] = [];
  for (const instance of ctx.db.item_instance.by_owner.filter(character.id)) {
    if (instance.equippedSlot) continue;
    const template = ctx.db.item_template.id.find(instance.templateId);
    if (!template || !template.isJunk) continue;
    const baseValue = BigInt(template.vendorValue ?? 0) * (instance.quantity ?? 1n);
    const vendorSellBonus = getPerkBonusByField(ctx, character.id, 'vendorSellBonus', character.level);
    let value = baseValue;
    if (vendorSellBonus > 0 && baseValue > 0n) {
      value = (baseValue * BigInt(100 + vendorSellBonus)) / 100n;
    }
    value = computeSellValue(value, character.vendorSellMod ?? 0n);
    total += value;
    soldNames.push(template.name);
    for (const affix of ctx.db.item_affix.by_instance.filter(instance.id)) {
      ctx.db.item_affix.id.delete(affix.id);
    }
    ctx.db.item_instance.id.delete(instance.id);
  }
  if (total > 0n) {
    ctx.db.character.id.update({ ...character, gold: (character.gold ?? 0n) + total });
    const summary = soldNames.length <= 3
      ? soldNames.join(', ')
      : `${soldNames.slice(0, 3).join(', ')}, and ${soldNames.length - 3} more`;
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
      `You sell all junk (${summary}) for ${total} gold.`);
  } else {
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', 'You have no junk to sell.');
  }
  return;
}

// --- SELL <N> <item> ---
const sellNMatch = raw.match(/^sell\s+(\d+)\s+(.+)$/i);
if (sellNMatch) {
  const qty = BigInt(sellNMatch[1]);
  const itemName = sellNMatch[2].trim();
  // ... find item, sell up to qty units, compute value with perk bonus
}
```

### Pattern 2: hotbar commands in intent.ts
**What:** Add `hotbar`, `hotbar set <slot> <ability>`, `hotbar swap <slot1> <slot2>`, `hotbar add <name>`, `hotbar <name>`, `hotbars` commands as an intent branch in `submit_intent`.
**When to use:** User types any hotbar-related command.
**Example:**
```typescript
// --- HOTBAR commands ---
if (lower === 'hotbars') {
  const hotbars = [...ctx.db.hotbar.by_character.filter(character.id)];
  // render each hotbar with clickable name and slot contents
  return;
}

if (lower.startsWith('hotbar')) {
  const hotbarArgs = raw.substring(6).trim();

  if (!hotbarArgs || lower === 'hotbar') {
    // Show active hotbar contents
    return;
  }

  const addMatch = hotbarArgs.match(/^add\s+(.+)$/i);
  if (addMatch) {
    // create new Hotbar row with given name
    return;
  }

  const setMatch = hotbarArgs.match(/^set\s+(\d+)\s+(.+)$/i);
  if (setMatch) {
    // assign ability to slot
    return;
  }

  const swapMatch = hotbarArgs.match(/^swap\s+(\d+)\s+(\d+)$/i);
  if (swapMatch) {
    // swap two slots
    return;
  }

  // bare "hotbar <name>" — switch active hotbar
  // ...
}
```

### Pattern 3: Persistent hotbar row in NarrativeConsole
**What:** Add a hotbar strip below the `NarrativeHud` bar, visible always (not just in combat), showing the active hotbar's 10 slots with cooldown overlays. Use the existing `hotbarDisplay` computed from `useHotbar`.
**When to use:** `selectedCharacter` is not null.
**Example — NarrativeHud.vue extension or new NarrativeHotbar.vue:**
```vue
<!-- row of 10 slot buttons -->
<div v-if="character" :style="hotbarRowStyle">
  <div :style="hotbarNameStyle">{{ activeHotbarName }}</div>
  <button
    v-for="slot in hotbarDisplay"
    :key="slot.slot"
    :style="slotBtnStyle(slot)"
    @click="$emit('use-slot', slot)"
    @contextmenu.prevent="$emit('slot-context', slot)"
  >
    <span>{{ slot.slot }}</span>
    <span>{{ slot.name }}</span>
    <div v-if="slot.cooldownRemaining > 0" :style="cooldownFillStyle(slot)" />
    <span v-if="slot.cooldownRemaining > 0">{{ slot.cooldownRemaining }}s</span>
  </button>
  <button :style="arrowBtnStyle" @click="$emit('prev-hotbar')">&#x25C0;</button>
  <button :style="arrowBtnStyle" @click="$emit('next-hotbar')">&#x25B6;</button>
</div>
```

### Pattern 4: Multiple Hotbar schema
**What:** Add a `Hotbar` parent table. `HotbarSlot` gets a `hotbarId` FK instead of just `characterId`.
**Current HotbarSlot columns:** `id`, `characterId`, `slot` (u8 1-10), `abilityTemplateId`, `assignedAt`
**New Hotbar table:**
```typescript
export const Hotbar = table(
  {
    name: 'hotbar',
    public: true,
    indexes: [{ accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    name: t.string(),       // 'default', 'buffs', 'combat', etc.
    sortOrder: t.u8(),      // 0-9 for ordering up to 10 hotbars
    isActive: t.bool(),     // which hotbar is currently active
    createdAt: t.timestamp(),
  }
);
```
Then `HotbarSlot` gains `hotbarId: t.u64()` and index `by_hotbar`. Old `by_character` index can remain for backward compat or be replaced.

**IMPORTANT: This is a schema change. Must `--clear-database` on local when publishing.**

### Anti-Patterns to Avoid
- **Putting sell-all-junk logic before vendor check:** Always check for vendor NPC first — selling without a vendor has no game meaning.
- **Not applying perk bonuses in intent.ts sell path:** The `sell_item` reducer correctly applies `getPerkBonusByField` and `computeSellValue`. The `intent.ts` `sell <item>` shortcut currently skips `getPerkBonusByField`. Fix this in NARR-01.
- **Using character.id-scoped hotbar queries after schema change:** After adding `hotbarId`, slots must be filtered by `hotbarId`, not `characterId`.
- **Rendering hotbar in NarrativeInput (bottom bar) instead of NarrativeConsole:** The hotbar must be always-visible even outside combat. `NarrativeInput` shows the `CombatActionBar` conditionally — this conflicts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sell value with perk bonus | Custom calculation | `computeSellValue` + `getPerkBonusByField` from existing helpers | Already battle-tested, consistent with `sell_item` reducer |
| Cooldown timer display | Manual date math | Existing `hotbarDisplay` computed in `useHotbar.ts` | Already handles server vs local cooldown reconciliation |
| Item name fuzzy matching | New search function | Existing pattern in intent.ts (`name.toLowerCase().includes(target)`) | Consistent with other intent commands |

**Key insight:** The sell logic, perk bonus calculations, and hotbar state management are all already implemented. The primary work is wiring them into new command paths and rendering the hotbar in a persistent location.

## Common Pitfalls

### Pitfall 1: Sell perk bonus missing from intent.ts shortcut
**What goes wrong:** `sell <item>` in intent.ts (line 915-916) uses `computeSellValue` but does NOT call `getPerkBonusByField` for the `vendorSellBonus` perk — the dedicated `sell_item` reducer does both. Players with vendor sell perks get less gold from the intent path.
**Why it happens:** The intent shortcut was added as a quick convenience without copying all the perk logic.
**How to avoid:** Import and call `getPerkBonusByField(ctx, character.id, 'vendorSellBonus', character.level)` in the intent.ts sell path, same as `sell_item` reducer.
**Warning signs:** Test comparing sell price with and without renown perk.

### Pitfall 2: sell_all_junk reducer also lacks perk bonus
**What goes wrong:** The existing `sell_all_junk` reducer (items.ts line 219-242) doesn't apply `vendorSellBonus` perk or `computeSellValue`. Only the standalone `sell_item` reducer applies both.
**Why it happens:** Inconsistent implementation.
**How to avoid:** Fix `sell_all_junk` reducer to apply both perk bonus and `computeSellValue` (same fix as for intent.ts). This is separate from NARR-02 which adds the command to intent.ts.

### Pitfall 3: Schema change requires clear-database on publish
**What goes wrong:** Adding `hotbarId` to `HotbarSlot` or adding the `Hotbar` table causes SpacetimeDB to reject the module publish without `--clear-database`.
**Why it happens:** SpacetimeDB cannot migrate existing columns; schema changes to existing tables require clearing.
**How to avoid:** Publish with `spacetime publish uwr -p spacetimedb --clear-database -y` locally when adding the `Hotbar` table. Document this in the plan explicitly. Per project rules: never auto-push to maincloud.

### Pitfall 4: Backward compatibility for existing hotbar slots
**What goes wrong:** Existing `hotbar_slot` rows have no `hotbarId`. If `hotbarId` becomes required, existing rows break.
**Why it happens:** Production data migration.
**How to avoid:** Make `hotbarId` optional with default `0n` representing "default hotbar", OR create a default hotbar per character on `clientConnected` / lazily on first hotbar command.

### Pitfall 5: HotbarSlot index naming after schema change
**What goes wrong:** Current code uses `ctx.db.hotbar_slot.by_character.filter(character.id)`. If we add `by_hotbar` index and keep `by_character`, both must be declared in table OPTIONS. Forgetting `algorithm: 'btree'` causes "reading 'tag'" error.
**Why it happens:** SpacetimeDB index definition requires explicit algorithm in OPTIONS.
**How to avoid:** Follow existing index pattern: `{ accessor: 'by_hotbar', algorithm: 'btree', columns: ['hotbarId'] }`.

### Pitfall 6: KIND_COLORS "social" not currently defined
**What goes wrong:** NARR-05 requires "social=blue" but the current `KIND_COLORS` map has `whisper` as `#74c0fc` (blue) and `say` as `#e9ecef` (white). There is no `social` key. If any event gets emitted with kind `'social'`, it falls through to the default `#ced4da`.
**Why it happens:** No social event kind exists yet; "social" in the requirement means grouping `say`/`whisper`.
**How to avoid:** Add `social: '#74c0fc'` to KIND_COLORS. Audit what new kinds (if any) need adding vs. what already exists.

## Code Examples

Verified patterns from official sources (codebase):

### Existing intent.ts sell pattern (lines 887-948)
```typescript
// Current — missing getPerkBonusByField call
const baseValue = BigInt(matchedTemplate.vendorValue ?? 0) * BigInt(matchedInstance.quantity ?? 1);
const value = computeSellValue(baseValue, character.vendorSellMod ?? 0n);
```
Must become:
```typescript
const baseValue = BigInt(matchedTemplate.vendorValue ?? 0) * BigInt(matchedInstance.quantity ?? 1);
const vendorSellBonus = getPerkBonusByField(ctx, character.id, 'vendorSellBonus', character.level);
let value = baseValue;
if (vendorSellBonus > 0 && baseValue > 0n) {
  value = (baseValue * BigInt(100 + vendorSellBonus)) / 100n;
}
value = computeSellValue(value, character.vendorSellMod ?? 0n);
```

### Set hotbar slot reducer (already in items.ts, lines 614-644)
```typescript
spacetimedb.reducer(
  'set_hotbar_slot',
  { characterId: t.u64(), slot: t.u8(), abilityTemplateId: t.u64() },
  (ctx, args) => { ... }
);
```
A new `swap_hotbar_slots` reducer is needed for `hotbar swap 1 3`:
```typescript
spacetimedb.reducer(
  'swap_hotbar_slots',
  { characterId: t.u64(), slot1: t.u8(), slot2: t.u8() },
  (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const slots = [...ctx.db.hotbar_slot.by_character.filter(character.id)];
    const a = slots.find(s => s.slot === args.slot1);
    const b = slots.find(s => s.slot === args.slot2);
    if (a && b) {
      ctx.db.hotbar_slot.id.update({ ...a, abilityTemplateId: b.abilityTemplateId });
      ctx.db.hotbar_slot.id.update({ ...b, abilityTemplateId: a.abilityTemplateId });
    } else if (a && !b) {
      ctx.db.hotbar_slot.id.update({ ...a, slot: args.slot2 });
    } else if (!a && b) {
      ctx.db.hotbar_slot.id.update({ ...b, slot: args.slot1 });
    }
  }
);
```

### KIND_COLORS current map (NarrativeMessage.vue lines 60-88)
All existing keys: `damage`, `heal`, `whisper`, `narrative`, `llm`, `system`, `command`, `say`, `presence`, `reward`, `npc`, `faction`, `avoid`, `blocked`, `creation`, `creation_error`, `creation_warning`, `look`, `move`, `world`, `combat_narration`, `combat_prompt`, `combat_status`, `combat_round_header`, `combat_resolving`, `buff`, `debuff`.

Missing for NARR-05: `social` (maps to whisper blue `#74c0fc`), `ability` (used in `use_ability` event emission — currently uncolored). The requirement says combat=red, reward=gold, system=gray, social=blue. These map to existing kinds: `damage`/`blocked` = red `#ff6b6b`, `reward` = `#ffd43b` (gold), `system` = `#adb5bd` (gray), `whisper` = `#74c0fc` (blue). No new kinds must be added for NARR-05 — just confirm those colors are correct and add any missing `social`/`ability` entries.

### useHotbar.ts setHotbarSlot call pattern
```typescript
// Client — calls set_hotbar_slot reducer (lines 207-214 of useHotbar.ts)
const setHotbarSlot = (slot: number, abilityTemplateId: bigint) => {
  if (!connActive.value || !selectedCharacter.value) return;
  setHotbarReducer({
    characterId: selectedCharacter.value.id,
    slot,
    abilityTemplateId,
  });
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HotbarPanel.vue (deleted in Phase 32) | Floating panel hotbar in App.vue | Phase 32 | FloatingPanel hotbar remains; NarrativeConsole has no hotbar |
| Single hardcoded hotbar (slots 1-10) | Same — still single hotbar per character | Current | Phase 34 expands to multiple named hotbars |
| `sell_item` reducer only for selling | `sell <item>` shortcut in intent.ts | Phase 33 era | Both paths exist; intent.ts path misses perk bonus |

**Deprecated/outdated:**
- `HotbarPanel.vue` was deleted in Phase 32 (was in "Deleted 5 additional orphaned components" list)
- Old `ActionBar.vue` and `CombatActionBar.vue` remain; `CombatActionBar.vue` is still used by `NarrativeInput.vue` during combat

## Open Questions

1. **Multiple hotbars — schema migration strategy**
   - What we know: Local clears are OK. Maincloud is not touched yet.
   - What's unclear: Whether to add `Hotbar` table OR just add `hotbarName`/`hotbarIndex` to `HotbarSlot`
   - Recommendation: Add `Hotbar` parent table — cleaner for listing/switching. Local `--clear-database` required.

2. **Where does the persistent hotbar render?**
   - What we know: `NarrativeHud.vue` is the fixed top bar. `NarrativeConsole.vue` renders below it. `NarrativeInput.vue` is the fixed bottom bar.
   - What's unclear: Whether hotbar goes between HUD and scroll area (as a second fixed row below HUD) or below the message scroll area above the input.
   - Recommendation: Add a second fixed row immediately below the `NarrativeHud` bar (same z-index, stacked). Adjust `NarrativeConsole`'s scroll area top padding to account for both rows.

3. **Out-of-combat ability use via hotbar**
   - What we know: `use_ability` reducer already handles out-of-combat use for non-utility abilities. `CombatActionBar` is only shown during combat in `NarrativeInput`. The persistent hotbar must call `useAbility` regardless of combat state.
   - What's unclear: Whether `onHotbarClick` in `useHotbar.ts` blocks out-of-combat ability use.
   - Recommendation: Review `onHotbarClick` — it only blocks `utility` kind during combat, not non-utility outside combat. Out-of-combat ability use should already work once the hotbar is always-visible.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (configured in project) |
| Config file | `vitest.config.ts` or inherits from `vite.config.ts` |
| Quick run command | `cd spacetimedb && npx vitest run --reporter=verbose` |
| Full suite command | `cd spacetimedb && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NARR-01 | sell `<item>` applies perk bonus correctly | unit | `npx vitest run src/reducers/intent.test.ts -t "sell item"` | ❌ Wave 0 |
| NARR-02 | sell all junk applies perk bonus + returns summary | unit | `npx vitest run src/reducers/intent.test.ts -t "sell all junk"` | ❌ Wave 0 |
| NARR-02 | sell N `<item>` sells correct quantity | unit | `npx vitest run src/reducers/intent.test.ts -t "sell N"` | ❌ Wave 0 |
| NARR-04 | hotbar set 1 `<ability>` routes to set_hotbar_slot | unit | `npx vitest run src/reducers/intent.test.ts -t "hotbar set"` | ❌ Wave 0 |
| NARR-04 | hotbar swap 1 3 swaps slot contents | unit | `npx vitest run src/reducers/items.test.ts -t "swap_hotbar"` | ❌ Wave 0 |
| NARR-05 | KIND_COLORS has entries for all required kinds | unit | `npx vitest run src/components/NarrativeMessage.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd spacetimedb && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd spacetimedb && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `spacetimedb/src/reducers/intent.test.ts` — extend existing intent test file with sell and hotbar test cases
- [ ] `spacetimedb/src/reducers/items.test.ts` — new file for swap_hotbar_slots reducer tests
- [ ] `src/components/NarrativeMessage.test.ts` — new file verifying KIND_COLORS completeness (can be lightweight)

*(Existing `intent.test.ts` exists for `buildLookOutput`. New sell/hotbar tests should be added to that file.)*

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `spacetimedb/src/reducers/intent.ts` — sell command (lines 887-948), all intent dispatch patterns
- Direct code inspection of `spacetimedb/src/reducers/items.ts` — `sell_item` (lines 154-217), `sell_all_junk` (lines 219-242), `set_hotbar_slot` (lines 614-644)
- Direct code inspection of `spacetimedb/src/helpers/economy.ts` — `computeSellValue`
- Direct code inspection of `spacetimedb/src/schema/tables.ts` — `HotbarSlot` table definition
- Direct code inspection of `src/composables/useHotbar.ts` — full hotbar client state machine
- Direct code inspection of `src/components/NarrativeMessage.vue` — `KIND_COLORS` map (lines 60-88)
- Direct code inspection of `src/components/NarrativeHud.vue` — fixed top bar layout
- Direct code inspection of `src/components/NarrativeConsole.vue` — scroll area layout
- Direct code inspection of `src/components/NarrativeInput.vue` — CombatActionBar wiring

### Secondary (MEDIUM confidence)
- `CLAUDE.md` SpacetimeDB TypeScript rules — index definition syntax, reducer patterns confirmed
- `.planning/STATE.md` decision log — Phase 32 deleted HotbarPanel.vue, extracted computeSellValue

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed in codebase
- Architecture: HIGH — all relevant files inspected directly
- Pitfalls: HIGH — perk bonus gap confirmed by direct code comparison between `sell_item` reducer and intent.ts shortcut
- Schema change requirement: HIGH — confirmed HotbarSlot has no multi-hotbar concept

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable domain, SpacetimeDB SDK won't change during this phase)
