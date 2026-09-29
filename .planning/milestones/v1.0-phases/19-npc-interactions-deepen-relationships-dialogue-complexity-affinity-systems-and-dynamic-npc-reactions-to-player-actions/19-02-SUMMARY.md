---
phase: 19-npc-interactions
plan: 02
subsystem: npc-interactions
tags: [backend, reducers, affinity, dialogue, gifts]
dependency_graph:
  requires:
    - "19-01 (NpcAffinity and NpcDialogueOption tables)"
    - "helpers/npc_affinity.ts (affinity calculation)"
    - "data/npc_data.ts (AFFINITY_TIERS constants)"
  provides:
    - "choose_dialogue_option reducer"
    - "give_gift_to_npc reducer"
    - "Dynamic NPC greetings based on affinity/faction/renown"
  affects:
    - "reducers/commands.ts (hailNpc function)"
    - "Client bindings (new reducer types)"
tech_stack:
  added:
    - "NPC interaction reducers (choose_dialogue_option, give_gift_to_npc)"
  patterns:
    - "Affinity-based dynamic greetings (7 tiers)"
    - "Multi-gate requirement validation (affinity + faction + renown)"
    - "Item consumption with stack handling"
    - "Value-based affinity calculation (vendorValue/10, clamped 1-20)"
key_files:
  created:
    - "spacetimedb/src/reducers/npc_interaction.ts"
    - "src/module_bindings/choose_dialogue_option_reducer.ts"
    - "src/module_bindings/choose_dialogue_option_type.ts"
    - "src/module_bindings/give_gift_to_npc_reducer.ts"
    - "src/module_bindings/give_gift_to_npc_type.ts"
    - "src/module_bindings/npc_affinity_table.ts"
    - "src/module_bindings/npc_affinity_type.ts"
    - "src/module_bindings/npc_dialogue_option_table.ts"
    - "src/module_bindings/npc_dialogue_option_type.ts"
  modified:
    - "spacetimedb/src/reducers/commands.ts (hailNpc with dynamic greetings)"
    - "spacetimedb/src/reducers/index.ts (registered npc_interaction reducers)"
    - "src/module_bindings/index.ts (exported new types and reducers)"
    - "src/module_bindings/npc_table.ts (schema updates)"
    - "src/module_bindings/npc_type.ts (schema updates)"
decisions:
  - key: "Dynamic greeting selection"
    choice: "Affinity tier-based greetings with faction/renown context overrides"
    rationale: "Hostile (-50): hostile glare, Friend (50): recognition, Close Friend (75): warmth, with renown-based respect for low affinity + high renown"
  - key: "Gift affinity calculation"
    choice: "vendorValue / 10, clamped to 1-20 range"
    rationale: "Scales with item value but prevents exploits via infinite cheap items or single ultra-valuable gift"
  - key: "Dialogue vs Log separation"
    choice: "Dialogue to Journal (NpcDialog), system messages to Log"
    rationale: "Keeps conversation history in dedicated NPC Dialog panel, system notifications in main log"
  - key: "Greeting affinity award"
    choice: "1 affinity per greeting (with 1-hour cooldown)"
    rationale: "Small incremental affinity via conversation, cooldown prevents grinding"
metrics:
  duration: 183s
  tasks_completed: 1
  files_created: 9
  files_modified: 5
  commits: 1
  completed_date: 2026-02-14
---

# Phase 19 Plan 02: NPC Interaction Reducers & Dynamic Greetings Summary

**One-liner:** Dynamic affinity-based NPC greetings, dialogue option reducer with multi-gate validation, and item gift system with value-based affinity gains.

## What Was Built

### Core Reducers

1. **choose_dialogue_option**
   - Validates affinity requirement (bigint comparison)
   - Validates faction standing if required (optional gate)
   - Validates renown rank if required (optional gate)
   - Awards affinity change from dialogue option
   - Logs player text + NPC response to Journal (NpcDialog table)

2. **give_gift_to_npc**
   - Consumes inventory item (handles stacks via quantity reduction)
   - Calculates affinity gain: `vendorValue / 10`, clamped 1-20
   - Awards affinity via `awardNpcAffinity` helper
   - Increments `giftsGiven` counter on NpcAffinity row
   - Logs gift message + NPC reaction to Journal
   - NPC reaction varies by current affinity tier (4 tiers)

3. **hailNpc (updated)**
   - Dynamic greeting generation based on context:
     - **Hostile** (affinity < -50 OR factionStanding < -50): "Leave. Now."
     - **Close Friend** (affinity >= 75): "Ah, my friend! It is good to see you again."
     - **Friend** (affinity >= 50): "Welcome back. What can I do for you?"
     - **Acquaintance** (affinity >= 25): "You again. What brings you?"
     - **Renowned Stranger** (renownRank >= 5 AND affinity < 25): "Your reputation precedes you."
     - **Default**: Static NPC greeting from table
   - Awards 1 affinity per greeting (if cooldown allows)
   - Logs "You begin to talk with X" to Log panel
   - Logs greeting to Journal (NpcDialog panel)

### Key Mechanics

**Affinity Tier Greetings:**
- 7 affinity tiers (-50 hostile to 100 devoted)
- Greetings at 5 breakpoints: <-50, 25, 50, 75, default
- Faction standing and renown rank override defaults

**Dialogue Requirement Gating:**
- Affinity threshold: `currentAffinity < option.requiredAffinity` blocks choice
- Faction threshold: `standing < requiredFactionStanding` blocks choice
- Renown threshold: `currentRank < requiredRenownRank` blocks choice
- All optional: dialogue option can use any combination

**Gift System:**
- Item consumption: reduces stack quantity or deletes item
- Equipped items blocked: "Unequip the item before gifting it."
- Affinity gain: based on vendor value (1-20 range prevents exploits)
- Gift counter: increments `NpcAffinity.giftsGiven` (future diminishing returns)

**Conversation Cooldown:**
- 1 hour between affinity-granting conversations (via `canConverseWithNpc`)
- Prevents affinity grinding via repeated hailing
- Enforced only on affinity award, not on dialogue/gifts

## Integration Points

**From Plan 01:**
- NpcAffinity table (character-NPC affinity tracking)
- NpcDialogueOption table (dialogue tree with requirements)
- `getAffinityForNpc`, `awardNpcAffinity`, `canConverseWithNpc` helpers
- AFFINITY_TIERS constants

**To Plan 03 (Frontend):**
- `chooseDialogueOption` reducer available in bindings
- `giveGiftToNpc` reducer available in bindings
- NpcAffinityRow, NpcDialogueOptionRow types exported
- Dynamic greetings visible in Journal on hail

## Deviations from Plan

None. Plan executed exactly as written.

## Verification Results

### Dynamic Greetings
- ✅ hailNpc generates different greetings at affinity levels: <-50, 0, 25, 50, 75+
- ✅ Faction standing override works (hostile at -50 faction standing)
- ✅ Renown rank override works (respect message at rank 5+, low affinity)
- ✅ Awards 1 affinity per greeting with cooldown enforcement

### Dialogue Options
- ✅ choose_dialogue_option validates affinity before allowing choice
- ✅ Validates faction requirement (optional gate)
- ✅ Validates renown requirement (optional gate)
- ✅ Logs both player text and NPC response to NpcDialog table
- ✅ Awards affinity change from dialogue option

### Gift System
- ✅ give_gift_to_npc consumes item (reduces stack or deletes)
- ✅ Calculates affinity gain from vendorValue/10 clamped 1-20
- ✅ NPC reaction varies by current affinity tier (4 tiers)
- ✅ Equipped items cannot be gifted
- ✅ Gift counter increments on NpcAffinity row

### Module & Bindings
- ✅ Module publishes successfully
- ✅ Client bindings include NpcAffinityRow, NpcDialogueOptionRow
- ✅ Reducers exported: ChooseDialogueOption, GiveGiftToNpc

## Implementation Notes

**Dynamic Greeting Logic:**
The greeting selection uses a cascading if-else chain prioritizing hostile states first, then affinity tiers in descending order, with renown override before default:

```typescript
if (factionStanding < -50 || affinity < -50) { /* hostile */ }
else if (affinity >= 75) { /* close friend */ }
else if (affinity >= 50) { /* friend */ }
else if (affinity >= 25) { /* acquaintance */ }
else if (renownRank >= 5 && affinity < 25) { /* renowned */ }
else { /* default static greeting */ }
```

**Dialogue vs Log Separation:**
- **Log panel** (EventPrivate with kind='system'): "You begin to talk with X", tier changes
- **Journal panel** (NpcDialog): Greetings, dialogue exchanges, gift reactions
- Both use `appendPrivateEvent` for reactivity but different `kind` values

**Gift Affinity Calculation:**
```typescript
let affinityGain = template.vendorValue / 10n;
if (affinityGain < 1n) affinityGain = 1n;
if (affinityGain > 20n) affinityGain = 20n;
```
This ensures:
- Minimum 1 affinity per gift (prevents zero-value exploits)
- Maximum 20 affinity per gift (prevents ultra-valuable item exploits)
- Scales proportionally with vendor value (10 gold = 1 affinity, 200 gold = 20 affinity)

## Self-Check: PASSED

### Files Created
- ✅ FOUND: spacetimedb/src/reducers/npc_interaction.ts
- ✅ FOUND: src/module_bindings/choose_dialogue_option_reducer.ts
- ✅ FOUND: src/module_bindings/choose_dialogue_option_type.ts
- ✅ FOUND: src/module_bindings/give_gift_to_npc_reducer.ts
- ✅ FOUND: src/module_bindings/give_gift_to_npc_type.ts
- ✅ FOUND: src/module_bindings/npc_affinity_table.ts
- ✅ FOUND: src/module_bindings/npc_affinity_type.ts
- ✅ FOUND: src/module_bindings/npc_dialogue_option_table.ts
- ✅ FOUND: src/module_bindings/npc_dialogue_option_type.ts

### Commits Exist
- ✅ FOUND: 78bc0bc (feat(19-02): implement NPC interaction reducers and dynamic greetings)

## Next Steps

**Phase 19 Plan 03:** Frontend integration
- NPC Dialog panel UI to display dialogue options
- Context menu items for NPCs: "Give Gift", "Talk"
- Dialogue option selection UI with requirement tooltips
- Inventory item selection for gift-giving
- Affinity display in NPC panel (current tier + numeric value)
