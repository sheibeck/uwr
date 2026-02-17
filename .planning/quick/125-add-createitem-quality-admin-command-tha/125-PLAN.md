---
phase: quick-125
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/commands.ts
  - src/composables/useCommands.ts
autonomous: true

must_haves:
  truths:
    - "/createitem common puts a common (no-affix) gear item in the selected character's inventory"
    - "/createitem uncommon puts an uncommon gear item with 1 affix in inventory"
    - "/createitem epic puts an epic gear item with 3 affixes in inventory"
    - "Invalid quality tiers (e.g. /createitem foo) are silently ignored client-side"
    - "The created item appears in the InventoryPanel with the correct quality color"
  artifacts:
    - path: "spacetimedb/src/reducers/commands.ts"
      provides: "create_test_item reducer"
      contains: "create_test_item"
    - path: "src/composables/useCommands.ts"
      provides: "/createitem <quality> command handler"
      contains: "createitem"
  key_links:
    - from: "src/composables/useCommands.ts"
      to: "conn.reducers.createTestItem"
      via: "useReducer(reducers.createTestItem)"
      pattern: "createTestItem"
    - from: "spacetimedb/src/reducers/commands.ts"
      to: "ctx.db.itemInstance"
      via: "addItemToInventory + itemAffix inserts"
      pattern: "addItemToInventory"
---

<objective>
Add a `/createitem <quality>` admin command that creates a test gear item of the specified quality tier (common/uncommon/rare/epic/legendary) in the selected character's inventory with appropriate affixes. Supports testing the Phase 14 loot quality system without needing to grind combat loot.

Purpose: Enable quality-tier testing during Phase 14 verification.
Output: Backend `create_test_item` reducer + client `/createitem` command wired to it.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

@spacetimedb/src/reducers/commands.ts
@spacetimedb/src/reducers/items.ts
@spacetimedb/src/helpers/items.ts
@spacetimedb/src/data/affix_catalog.ts
@src/composables/useCommands.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add create_test_item reducer to backend commands.ts</name>
  <files>spacetimedb/src/reducers/commands.ts</files>
  <action>
At the top of `commands.ts`, add an import alongside the existing `buildDisplayName` import already present in `items.ts`:
```
import { generateAffixData, buildDisplayName } from '../helpers/items';
```

Add the following reducer at the end of `registerCommandReducers`, before the closing `};`:

```typescript
spacetimedb.reducer(
  'create_test_item',
  { characterId: t.u64(), qualityTier: t.string() },
  (ctx, { characterId, qualityTier }) => {
    const character = requireCharacterOwnedBy(ctx, characterId);

    const validTiers = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    if (!validTiers.includes(qualityTier)) {
      return fail(ctx, character, `Invalid quality tier. Use: ${validTiers.join(', ')}`);
    }

    // Pick a random gear slot from those supported by affix catalog
    const gearSlots = ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt', 'mainHand'];
    const slotIdx = Number(ctx.timestamp.microsSinceUnixEpoch % BigInt(gearSlots.length));
    const slot = gearSlots[slotIdx]!;

    // Find any item template for this slot
    let template: any = null;
    for (const tmpl of ctx.db.itemTemplate.iter()) {
      if (tmpl.slot === slot && !tmpl.isJunk) {
        template = tmpl;
        break;
      }
    }
    // Fallback: if no template found for the slot, pick any non-junk gear template
    if (!template) {
      for (const tmpl of ctx.db.itemTemplate.iter()) {
        if (['chest', 'legs', 'boots', 'mainHand', 'head', 'hands', 'wrists', 'belt'].includes(tmpl.slot) && !tmpl.isJunk) {
          template = tmpl;
          break;
        }
      }
    }
    if (!template) return fail(ctx, character, 'No item templates found to create test item');

    // Check inventory space (max 20 non-equipped items)
    const itemCount = [...ctx.db.itemInstance.by_owner.filter(character.id)].filter((r) => !r.equippedSlot).length;
    if (itemCount >= 20) return fail(ctx, character, 'Backpack is full');

    // Add base item to inventory
    addItemToInventory(ctx, character.id, template.id, 1n);

    // For non-common, apply affixes
    let displayName = template.name;
    if (qualityTier !== 'common') {
      // Find the newly created instance (no qualityTier set yet, not equipped)
      const instances = [...ctx.db.itemInstance.by_owner.filter(character.id)];
      const newInstance = instances.find(
        (i) => i.templateId === template.id && !i.equippedSlot && !i.qualityTier
      );
      if (newInstance) {
        const seedBase = ctx.timestamp.microsSinceUnixEpoch + character.id;
        const affixes = generateAffixData(template.slot, qualityTier, seedBase);
        for (const affix of affixes) {
          ctx.db.itemAffix.insert({
            id: 0n,
            itemInstanceId: newInstance.id,
            affixType: affix.affixType,
            affixKey: affix.affixKey,
            affixName: affix.affixName,
            statKey: affix.statKey,
            magnitude: affix.magnitude,
          });
        }
        displayName = buildDisplayName(template.name, affixes);
        ctx.db.itemInstance.id.update({
          ...newInstance,
          qualityTier,
          displayName,
        });
      }
    }

    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'reward',
      `[Test] Created ${qualityTier} item: ${displayName}.`
    );
  }
);
```

Note: `generateAffixData` and `buildDisplayName` are imported from `'../helpers/items'` at the top of the file. `addItemToInventory`, `appendPrivateEvent`, `requireCharacterOwnedBy`, `fail`, and `t` are already available via `deps`.
  </action>
  <verify>
After adding the reducer, publish the module:
```
spacetime publish uwr --project-path spacetimedb
```
Then regenerate client bindings:
```
spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb
```
Confirm `createTestItem` appears in the generated bindings:
```
grep -n "createTestItem" src/module_bindings/index.ts
```
  </verify>
  <done>Module publishes without errors. `createTestItem` appears in generated `src/module_bindings` files.</done>
</task>

<task type="auto">
  <name>Task 2: Wire /createitem <quality> in useCommands.ts</name>
  <files>src/composables/useCommands.ts</files>
  <action>
In `src/composables/useCommands.ts`:

1. Add a new `useReducer` call alongside the existing ones (e.g., after `spawnCorpseReducer`):
```typescript
const createTestItemReducer = useReducer(reducers.createTestItem);
```

2. In the `submitCommand` function, add a new `else if` branch after the `/spawncorpse` block and before the `/resetwindows` block:
```typescript
} else if (lower.startsWith('/createitem ')) {
  const tier = raw.slice(12).trim().toLowerCase();
  const validTiers = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  if (!validTiers.includes(tier)) return;
  createTestItemReducer({
    characterId: selectedCharacter.value.id,
    qualityTier: tier,
  });
}
```

The guard `if (!validTiers.includes(tier)) return;` ensures unknown tiers are silently ignored on the client side before hitting the server.
  </action>
  <verify>
Run the dev server (`npm run dev`) and open the game. Select a character and type `/createitem rare` in the command box. Confirm a new item with blue quality coloring appears in the inventory panel and the event log shows `[Test] Created rare item: ...`.

Test edge cases:
- `/createitem legendary` — item appears with purple/legendary color
- `/createitem foo` — nothing happens (silently ignored)
- `/createitem common` — plain item, no affix tooltip lines
  </verify>
  <done>
Valid quality tiers create an item visible in the InventoryPanel with the correct quality border color. Invalid tiers are silently ignored. Event log shows `[Test] Created <tier> item: <name>`.
  </done>
</task>

</tasks>

<verification>
1. `spacetime publish uwr --project-path spacetimedb` succeeds with no errors.
2. Generated bindings include `createTestItem` reducer.
3. `/createitem common` in-game adds a plain gear item to inventory.
4. `/createitem uncommon` adds item with 1 affix visible in tooltip.
5. `/createitem rare` adds item with 2 affixes.
6. `/createitem epic` adds item with 3 affixes.
7. `/createitem legendary` adds a legendary item (0 rolled affixes — uses fixed legendary affix system per `AFFIX_COUNT_BY_QUALITY`).
8. `/createitem garbage` does nothing.
</verification>

<success_criteria>
Admin can type `/createitem <quality>` in-game to create gear items of any quality tier for testing. Items appear in inventory with correct quality colors and affix tooltips matching the tier. No errors in spacetime logs.
</success_criteria>

<output>
After completion, create `.planning/quick/125-add-createitem-quality-admin-command-tha/125-SUMMARY.md` following the summary template.
</output>
