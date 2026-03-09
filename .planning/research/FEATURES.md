# Feature Landscape

**Domain:** Browser RPG — v2.1 cleanup, narrative integration, combat polish, dynamic equipment
**Researched:** 2026-03-09
**Confidence:** HIGH (based on existing codebase analysis + established RPG patterns)

## Table Stakes

Features users expect in an RPG with the systems UWR already has. Missing = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|-------------|-------|
| Sell items via narrative command | Players at vendors need to sell; `sell <item>` works in intent router but sell-all-junk and bulk operations are only in legacy UI | Low | Existing `sell_item`, `sell_all_junk` reducers | Wire `sell all junk` and quantity selling into intent router |
| Hotbar visible in narrative UI | Players need quick access to abilities during combat; HotbarPanel.vue exists but floats outside narrative flow | Med | Existing `hotbar_slot` table, `set_hotbar_slot` reducer, HotbarPanel.vue | Integrate as inline combat HUD element, not a separate floating panel |
| Combat log completeness | Players cannot understand combat without seeing DoT ticks, HoT ticks, debuff applications, buff expirations | Med | Existing `appendPrivateEvent`, `appendGroupEvent` in combat.ts | Many code paths silently apply effects without logging |
| DoT/HoT indicators on enemies | Players fighting enemies with active effects have no visual indication of what debuffs/buffs are active | Med | Existing `combat_enemy_effect` table | Client renders effect badges on enemy entries |
| Debuff/buff indicators on self | Players need to see their own active effects during combat | Low | Existing `character_effect` table, already partially shown | Ensure all effect types display with remaining duration |
| Equipment drops scaled to level | Killing enemies should yield gear appropriate to player level; currently drops come from hardcoded loot tables with static item_defs | High | Existing `rollQualityTier`, `generateAffixData`, `buildDisplayName`, loot table system | Core gap: items are seeded not dynamically generated per encounter level |
| Dead code removal | 52K+ LOC with v1.0 legacy UI components, old seeded data, unused reducers creating confusion | Med | Audit of files in `seeding/`, `data/`, old Vue components | MEMORY.md lists specific files to delete |

## Differentiators

Features that set the product apart. Not expected by default, but create memorable experiences.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|-------------|-------|
| Power-scaled dynamic equipment generation | Generate equipment templates on-the-fly using enemy level, world tier, and rarity rolls — every drop feels unique rather than pulling from a fixed pool | High | Existing `rollQualityTier`, `rollQualityForDrop`, `generateAffixData`, tier weight tables | Foundation is 80% built. Gap is creating item_template rows dynamically instead of selecting from seeded WORLD_DROP_GEAR_DEFS |
| Narrative event feed integration | World events, location events, and private events flow through the Keeper's narrative console with distinct visual treatment per event kind | Med | Existing event tables (`event_world`, `event_location`, `event_private`, `event_group`) | Style events by kind: combat=red, reward=gold, system=gray, social=blue |
| Global font scale control | Accessibility: let players adjust the narrative console font size — critical for readability in a text-heavy RPG | Low | CSS custom properties, localStorage | Simple --font-scale CSS variable approach |
| Multi-enemy pull verification | Combat encounters with multiple enemy groups combine correctly with group composition and danger scaling verified | Med | Existing combat encounter creation, `enemy_spawn` system | Testing/verification task |
| Narrative sell experience | The Keeper narrates transactions with sardonic character instead of dry "You sell X for Y gold" | Low | Existing sell reducer, Keeper narrator pattern | Template-based narration, no LLM needed |
| Ability type expansion for non-combat systems | Generated abilities cover crafting, gathering, travel, social — not just combat | High | `ABILITY_KINDS` in mechanical_vocabulary.ts, skill generation system | New kinds: 'craft_boost', 'gather_boost', 'travel_speed', 'haggle' |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| LLM-generated item names per drop | Too slow (latency per drop), too expensive (API costs scale with kill rate), descriptions lack mechanical consistency | Use existing affix name composition (`buildDisplayName`): "Fierce Iron Shortsword of Precision" is fast, deterministic, thematic |
| Drag-and-drop hotbar management | Adds complexity to a text-first narrative UI; fights the design philosophy | Text commands: `hotbar set 1 ability_name` or `hotbar swap 1 3` fits the console model |
| Floating damage numbers animation | Visual noise in a text console UI; belongs in a graphical RPG | Log damage inline in combat narrative with color coding |
| Tooltip-heavy item UI | Hover tooltips break on mobile, fight text-first design | Inline details: `look at Fierce Iron Shortsword` shows stats in the narrative console |
| Equipment comparison popup | Modal pattern interrupts narrative flow | Inline: `compare Fierce Shortsword` shows side-by-side in console |
| Auto-equip / gear score system | Removes player agency about stat priorities | Players choose what to equip based on their build; respects player intelligence |
| Streaming LLM tokens | Already ruled out in PROJECT.md | Keep typewriter animation for LLM responses |

## Feature Dependencies

```
Dead code removal ─────────────────> All other features (clean foundation first)
                                      |
Equipment drops from combat ──────> Power-scaled dynamic equipment generation
  (currently hardcoded loot tables)   (generate item_templates on the fly)
                                      |
Sell items via narrative command ──> Narrative sell experience
  (basic command wiring)              (Keeper-narrated transactions)
                                      |
Hotbar visible in narrative UI ───> Combat log completeness
  (see abilities to use them)         (see results of using them)
                                      |
DoT/HoT indicators on enemies ───> Combat log completeness
  (visual + textual feedback)         (both needed for combat clarity)
                                      |
Global font scale control           (independent, can ship anytime)
                                      |
Multi-enemy pull verification       (independent testing task)
                                      |
Narrative event feed integration    (independent, enhances all systems)
```

## MVP Recommendation

Prioritize for v2.1 in this order:

1. **Dead code removal** — Must come first. Removing ~15 files of seeded data, old Vue components, and unused reducers reduces cognitive load for all subsequent work. MEMORY.md already identifies specific files to delete.

2. **Combat log completeness** — Table stakes. Players cannot play effectively without understanding what happened. Add missing log entries for: DoT tick damage, HoT tick healing, buff application/expiration, debuff application/expiration, CC effects (stun/root/silence), shield absorption, pet actions.

3. **DoT/HoT/debuff indicators on enemies** — Table stakes companion to combat logging. Client reads `combat_enemy_effect` rows and renders badges showing active effect name + remaining duration.

4. **Sell items + hotbar in narrative UI** — Table stakes. Both systems exist in reducers but lack narrative UI wiring. Sell: extend intent router to handle `sell all junk`, `sell 3 Rat Tail`. Hotbar: render as inline combat HUD showing numbered ability slots with cooldown state.

5. **Narrative event feed integration** — Differentiator. Style event entries by kind in the narrative console. Low effort, high polish impact.

6. **Global font scale control** — Low-effort differentiator. CSS `--font-scale` variable + localStorage persistence + settings control.

7. **Power-scaled dynamic equipment generation** — Differentiator, high complexity. Foundation is solid (rarity rolling, affix generation, quality tiers all exist). Gap: generating `item_template` rows dynamically from formulas rather than selecting from seeded `WORLD_DROP_GEAR_DEFS`.

**Defer to v2.2:**
- **Ability type expansion for non-combat systems** — Requires new ability kinds in mechanical vocabulary, new dispatch handlers, integration with crafting/gathering/travel. Too much scope for a cleanup milestone.

## Complexity Analysis

### Dynamic Equipment Generation (the hardest feature)

**What exists (80% of infrastructure):**
- `rollQualityTier()` — rarity (common/uncommon/rare/epic) based on creature level, seed, danger
- `rollQualityForDrop()` — craftsmanship (standard/reinforced/exquisite) independently
- `generateAffixData()` — picks prefix/suffix affixes from catalog based on slot, quality, seed
- `buildDisplayName()` — composes "Prefix BaseItem Suffix" names
- `WORLD_DROP_GEAR_DEFS` / `WORLD_DROP_JEWELRY_DEFS` — static item definitions per tier
- `getWorldTier()` — maps level to tier (1-5)
- `TIER_RARITY_WEIGHTS` / `TIER_QUALITY_WEIGHTS` — probability tables per tier
- `ARMOR_ALLOWED_CLASSES` — class restrictions per armor type

**What's missing (20% gap):**
- A function to generate a new `item_template` row with level-scaled stats (AC, damage, DPS) rather than selecting from a fixed pool
- Stat scaling formulas: how does a T3 chest piece's AC compare to T2? Currently hardcoded per def
- Base item name pool: deterministic names per slot+armorType+tier (can reuse existing names)

**Recommended approach:**
Create `generateItemTemplate(ctx, slot, armorType, tier, level, seed)` that:
1. Computes base stats from formulas (AC = `BASE_ARMOR_VALUES[type]` * tier_multiplier, damage = level-scaled)
2. Picks a base name from a name pool keyed by slot+type+tier
3. Sets `allowedClasses` from `ARMOR_ALLOWED_CLASSES`
4. Inserts a new `item_template` row
5. Returns the template for affix generation and instance creation

Estimated: ~200-300 lines of new code, mostly formula tuning.

### Combat Log Gaps (medium complexity)

**Missing log entries identified in code review:**
- DoT tick damage per tick
- HoT tick healing per tick
- Buff/debuff application (which stat, magnitude, duration)
- Buff/debuff expiration
- Shield absorption amount
- CC application and CC break events
- Pet attack and pet damage taken events

Estimated: ~100-150 lines of `appendPrivateEvent` / `appendGroupEvent` calls at existing code points.

### Narrative UI Integration (low-medium complexity)

**Sell integration:**
- Intent router already handles `sell <item>` (line 880 of intent.ts)
- Missing: `sell all junk`, `sell N <item>`, quantity parsing
- Estimated: ~30-50 lines in intent.ts

**Hotbar integration:**
- HotbarPanel.vue exists as floating panel
- Need: inline rendering in narrative combat HUD
- Hotbar slots already in `hotbar_slot` table with `by_character` index
- `useHotbar.ts` composable exists
- Estimated: ~50-100 lines of Vue template + style work

**Event feed styling:**
- Events already flow through narrative console as plain text
- Need: CSS class per event kind, color differentiation
- Estimated: ~30-50 lines of CSS + minimal template changes

## Sources

- Codebase: `spacetimedb/src/helpers/items.ts` (equipment bonuses, affix application, inventory management)
- Codebase: `spacetimedb/src/data/item_defs.ts` (all static item definitions, world drop gear/jewelry)
- Codebase: `spacetimedb/src/data/affix_catalog.ts` (prefix/suffix system, magnitude scaling)
- Codebase: `spacetimedb/src/data/mechanical_vocabulary.ts` (all game mechanics vocabulary)
- Codebase: `spacetimedb/src/data/combat_scaling.ts` (damage formulas, stat scaling, weapon mechanics)
- Codebase: `spacetimedb/src/helpers/combat_rewards.ts` (XP, death penalties, spawn reset)
- Codebase: `spacetimedb/src/reducers/intent.ts` (sell command handling at line 880)
- Codebase: `spacetimedb/src/reducers/items.ts` (sell_item, sell_all_junk, set_hotbar_slot reducers)
- Codebase: `spacetimedb/src/helpers/events.ts` (event logging infrastructure, all append* functions)
- Codebase: `spacetimedb/src/reducers/items_trading.ts` (trade system for reference)
- Project: `.planning/PROJECT.md` (v2.1 scope, architectural decisions)
- Project: `MEMORY.md` (v2.0 architecture, dead code list, execution plan)
