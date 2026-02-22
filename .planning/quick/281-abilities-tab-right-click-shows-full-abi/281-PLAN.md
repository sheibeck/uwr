---
phase: quick-281
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/CharacterInfoPanel.vue
autonomous: true
requirements:
  - QUICK-281
must_haves:
  truths:
    - "Right-clicking an ability row shows the ability name as a header in the popup"
    - "The popup shows mana/stamina cost (or 'Free'), cast time, and cooldown"
    - "The popup shows the ability description"
    - "The 'Add to Hotbar' button still appears below the info"
  artifacts:
    - path: "src/components/CharacterInfoPanel.vue"
      provides: "Expanded context menu with full ability info"
      contains: "castSeconds"
  key_links:
    - from: "contextMenu state"
      to: "ability row @contextmenu.prevent"
      via: "showContextMenu captures full ability fields"
      pattern: "showContextMenu.*castSeconds"
---

<objective>
Expand the Abilities tab right-click context menu in CharacterInfoPanel.vue to display the full ability info (name, cost, cast time, cooldown, description) above the "Add to Hotbar" action button.

Purpose: The context menu currently shows only the description string. This surfaces all the info the user needs without opening a separate popup.
Output: Updated CharacterInfoPanel.vue with a richer context menu.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Expand ability context menu to show full ability info</name>
  <files>src/components/CharacterInfoPanel.vue</files>
  <action>
Three changes to CharacterInfoPanel.vue:

**1. Expand the `availableAbilities` prop type** to include the additional fields from AbilityTemplateRow:

```ts
availableAbilities: {
  key: string;
  name: string;
  description: string;
  resource: string;
  kind: string;
  level: bigint;
  castSeconds: bigint;
  cooldownSeconds: bigint;
  resourceCost: bigint;
  damageType?: string | null;
}[];
```

**2. Expand `contextMenu` ref state** to hold the extra fields:

```ts
const contextMenu = ref<{
  visible: boolean; x: number; y: number;
  abilityKey: string; name: string; description: string;
  resource: string; resourceCost: bigint;
  castSeconds: bigint; cooldownSeconds: bigint;
}>({
  visible: false, x: 0, y: 0, abilityKey: '', name: '', description: '',
  resource: '', resourceCost: 0n, castSeconds: 0n, cooldownSeconds: 0n,
});
```

**3. Update `showContextMenu`** signature and invocation to pass the full ability:

Replace the existing `showContextMenu` calls in the template and the function itself. The `@contextmenu.prevent` on each ability row becomes:
```
@contextmenu.prevent="showContextMenu($event, ability)"
```

The function becomes:
```ts
const showContextMenu = (event: MouseEvent, ability: typeof availableAbilities[number]) => {
  contextMenu.value = {
    visible: true, x: event.clientX, y: event.clientY,
    abilityKey: ability.key, name: ability.name, description: ability.description,
    resource: ability.resource, resourceCost: ability.resourceCost,
    castSeconds: ability.castSeconds, cooldownSeconds: ability.cooldownSeconds,
  };
};
```

For the renown perk rows the existing call passes an empty-object ability stub — keep using the old 4-arg signature pattern OR pass a minimal stub that satisfies the new type (zeroed bigints). Simplest: leave renown perk call as-is by keeping an overload or by passing a stub object:
```
@contextmenu.prevent="showContextMenu($event, { key: perk.perkKey, name: perk.perkKey, description: '', resource: '', resourceCost: 0n, castSeconds: 0n, cooldownSeconds: 0n, kind: '', level: 0n })"
```

**4. Expand the context menu popup markup** to render a structured info block instead of just `contextMenu.description`.

Replace the single description `<div>` with a compound info section:

```html
<!-- Ability name header -->
<div :style="{
  padding: '8px 14px 4px',
  color: '#e5e7eb',
  fontSize: '0.85rem',
  fontWeight: 600,
  borderBottom: '1px solid rgba(255,255,255,0.08)',
}">{{ contextMenu.name }}</div>

<!-- Stats row: cost / cast / cooldown -->
<div :style="{
  padding: '6px 14px',
  borderBottom: contextMenu.description ? '1px solid rgba(255,255,255,0.08)' : 'none',
  display: 'flex', flexDirection: 'column', gap: '2px',
}">
  <!-- Cost -->
  <div :style="{ fontSize: '0.75rem', color: '#9ca3af' }">
    Cost:
    <span :style="{ color: '#e5e7eb' }">{{
      contextMenu.resource === 'mana'
        ? `${contextMenu.resourceCost} mana`
        : contextMenu.resource === 'stamina'
          ? `${contextMenu.resourceCost} stamina`
          : 'Free'
    }}</span>
  </div>
  <!-- Cast -->
  <div :style="{ fontSize: '0.75rem', color: '#9ca3af' }">
    Cast: <span :style="{ color: '#e5e7eb' }">{{ contextMenu.castSeconds > 0n ? `${Number(contextMenu.castSeconds)}s` : 'Instant' }}</span>
  </div>
  <!-- Cooldown -->
  <div :style="{ fontSize: '0.75rem', color: '#9ca3af' }">
    Cooldown: <span :style="{ color: '#e5e7eb' }">{{ contextMenu.cooldownSeconds > 0n ? `${Number(contextMenu.cooldownSeconds)}s` : 'None' }}</span>
  </div>
</div>

<!-- Description (only if present) -->
<div
  v-if="contextMenu.description"
  :style="{
    padding: '6px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    color: '#9ca3af',
    fontSize: '0.8rem',
    lineHeight: '1.4',
    maxWidth: '220px',
    whiteSpace: 'normal',
  }"
>{{ contextMenu.description }}</div>
```

The "Add to Hotbar" button stays below unchanged.

Do NOT change the hotbar right-click popup (quick-280 is already complete). Do NOT modify any files other than CharacterInfoPanel.vue.
  </action>
  <verify>
Open the app, navigate to Character panel > Abilities tab, right-click any ability row. Confirm the popup shows:
- Ability name in a header line
- Cost, Cast, Cooldown stat rows
- Description text (when present)
- "Add to Hotbar" button at the bottom

Also confirm renown perk right-click still opens a menu without errors.

TypeScript compilation: `npx vue-tsc --noEmit` (or the project's type-check script) should pass with no new errors.
  </verify>
  <done>
Right-clicking an ability in the Abilities tab shows name + cost + cast + cooldown + description + "Add to Hotbar". No TypeScript errors introduced.
  </done>
</task>

</tasks>

<verification>
- Right-click on ability row in Abilities tab renders full info popup
- "Add to Hotbar" button still works and emits add-ability-to-hotbar
- Renown perk right-click still renders a popup without JS errors
- No regressions in hotbar right-click behavior (separate component, not touched)
</verification>

<success_criteria>
CharacterInfoPanel.vue abilities context menu displays name, cost, cast time, cooldown, and description above the "Add to Hotbar" action button.
</success_criteria>

<output>
After completion, create `.planning/quick/281-abilities-tab-right-click-shows-full-abi/281-SUMMARY.md`
</output>
