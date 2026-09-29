# Phase 36: Ability Expansion - Research

**Researched:** 2026-03-10
**Domain:** Dynamic ability system, race abilities, heritage bonuses, renown perks
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Add new ability kinds: songs, auras, travel, pets, fear, buffs, summoning food, bandages, potions
- These work through the existing dynamic ability system (kind-based dispatch)
- Server and client dispatch must handle all new kinds
- Many LLM-suggested abilities are both debuffs AND damage — we need abilities that are JUST buffs or JUST debuffs
- Example debuffs: slow (reduces enemy attack speed), fear (CC effect)
- Example buffs: haste, strength, intelligence (stat buffs)
- Pure buffs must be castable OUTSIDE of combat on self or party members
- Race abilities must become REAL, functional abilities — not just narrative
- Race abilities should be minor passive or active effects, longer cooldowns
- Heritage bonuses must apply EVERY level (not every other level as in v1.0)
- Heritage bonuses must be shown during character creation AND level-up
- Renown perks are essentially abilities — bring them into the dynamic ability system
- Abilities now have different sources: Class, Renown, Race
- Renown perks offered dynamically via LLM (like level-up abilities)
- When gaining a renown rank, trigger a perk selection flow similar to level-up
- Notify user in header that they've gained a renown rank
- Player goes into renown UI and chooses rewards for the new renown level
- LLM needs specific rules/constraints for generating renown perks

### Claude's Discretion

- Specific ability kind enum values and naming
- Internal data structures for ability source tracking
- How heritage bonuses interact with the existing stat system
- Exact LLM prompt rules for renown perk generation
- UI layout details for renown rank-up flow

### Deferred Ideas (OUT OF SCOPE)

None — all items are in scope for this phase
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ABIL-01 | Ability kinds in mechanical_vocabulary.ts cover all systems (combat, crafting, gathering, travel, social, songs, auras, pets, fear, summoning) | Section: New Ability Kinds — exact new ABILITY_KINDS entries identified |
| ABIL-02 | Missing ability kinds (resurrect, corpse_summon, track, group_heal, songs, auras, travel, pets, fear, bandages, potions, food_summon) added to server dispatch | Section: Server Dispatch — resolveAbility fallback already handles unknown kinds gracefully |
| ABIL-03 | Skill generation system can produce non-combat abilities (craft_boost, gather_boost, travel_speed, haggle, buff-only, debuff-only) | Section: Skill Generation — SKILL_GENERATION_SCHEMA and LLM prompts need expansion |
| ABIL-04 | Client ability dispatch handles all new ability kinds without special-casing | Section: Client Dispatch — client calls cast_ability reducer, no kind-specific client logic required |
| ABIL-05 | Pure buff and pure debuff abilities (haste, stat buffs, slow, fear) without damage — castable outside combat | Section: Pure Buffs/Debuffs — current debuff handler deducts 75% direct damage; needs pure-debuff path |
| ABIL-06 | Race abilities are functional in-game — minor passive or active effects on longer cooldowns | Section: Race Abilities — currently no ability_template rows for race; need seeding pattern |
| ABIL-07 | Heritage bonuses apply every level (not every other level) and shown during creation and level-up | Section: Heritage Bonuses — computeRacialAtLevelFromRow uses evenLevels; one line change to level |
| ABIL-08 | Renown perks use the dynamic ability system | Section: Renown Integration — renown_data.ts currently stores perks as bespoke perk objects, not ability_template rows |
| ABIL-09 | Renown rank-up triggers LLM-driven perk selection flow | Section: Renown Rank-Up Flow — currently sends text notification, no pending state table |
| ABIL-10 | Abilities track their source (Class, Renown, Race) for UI display and filtering | Section: Source Tracking — ability_template has no source column; needs schema migration |
| ABIL-11 | LLM has constraint rules for generating renown perks (different from class abilities) | Section: LLM Prompts — new buildRenownPerkSystemPrompt needed |
</phase_requirements>

---

## Summary

Phase 36 expands the dynamic ability system across all game systems. The core dispatch infrastructure (resolveAbility in helpers/combat.ts) is already kind-based and handles unknown kinds gracefully with a fallback log message. The primary work is: (1) adding new ABILITY_KINDS to mechanical_vocabulary.ts and corresponding dispatch cases in resolveAbility, (2) fixing the debuff handler to support pure debuffs without a damage component and enabling out-of-combat casting of buffs/debuffs, (3) implementing race abilities as seeded ability_template rows, (4) changing the heritage bonus formula from evenLevels to allLevels, and (5) replacing the static RENOWN_PERK_POOLS system with LLM-driven ability generation.

The biggest structural change is renown perks: they currently live as bespoke objects in renown_data.ts with custom effect fields. Migrating them to ability_template rows means adding a `source` column to ability_template and a `pending_renown_perk` table (mirroring the pending_skill pattern used for level-up abilities). The choose_perk reducer logic and getPerkBonusByField helper would then read from the standard ability system instead of RENOWN_PERK_POOLS.

**Primary recommendation:** Treat this phase as four independent sub-systems: (1) vocabulary + dispatch expansion, (2) pure buff/debuff outside-combat fix, (3) race abilities seeding, (4) renown perk LLM migration. Execute them in dependency order.

---

## Standard Stack

### Core — Already in Place

| Component | Location | Purpose | Status |
|-----------|----------|---------|--------|
| `ABILITY_KINDS` | `mechanical_vocabulary.ts` | Enum of all ability kinds | Needs additions |
| `resolveAbility` | `helpers/combat.ts` | Unified kind-based dispatch | Working; needs new cases |
| `processGeneratedSkill` | `helpers/skill_budget.ts` | Validates + clamps LLM output | Needs BASE_BUDGET entries for new kinds |
| `parseSkillGenResult` | `helpers/skill_gen.ts` | Parses LLM JSON into PendingSkill rows | Works as-is |
| `ability_template` table | `schema/tables.ts` | Stores character abilities | Needs `source` + `abilityKey` columns |
| `pending_skill` table | `schema/tables.ts` | Pending choices from level-up | Reuse pattern for renown perks |
| `SKILL_GENERATION_SCHEMA` | `data/llm_prompts.ts` | LLM JSON schema for abilities | Needs new kinds in kind enum |
| `computeRacialAtLevelFromRow` | `helpers/combat_rewards.ts` | Computes racial stats at level | Needs evenLevels → allLevels |
| `RENOWN_PERK_POOLS` | `data/renown_data.ts` | Static perk definitions | To be replaced by LLM |
| `awardRenown` | `helpers/renown.ts` | Awards renown + notifies rank-up | Needs pending_renown_perk trigger |

### No New Dependencies Required

All work is within the existing TypeScript SpacetimeDB server module. No new npm packages needed.

---

## Architecture Patterns

### New Ability Kinds to Add

Based on CONTEXT.md decisions and the existing ABILITY_KINDS list, add these to `mechanical_vocabulary.ts`:

```typescript
// Current ABILITY_KINDS (15 entries) — add these:
'song',          // Toggle-on/off party-wide effect while active
'aura',          // Passive area effect around the character (always-on buff)
'travel',        // Increases movement speed, reveals nearby locations
'fear',          // CC debuff preventing enemy from acting (maps to cc handler)
'bandage',       // Consumable-like heal with charges or long cooldown
'potion',        // Consumable-like buff/heal with charges or long cooldown
'food_summon',   // Create consumable items providing temporary buffs
'resurrect',     // Revive a dead party member (already in TARGET_RULES: 'corpse')
'group_heal',    // Already referenced in hasHealingAbilities — make it official
'craft_boost',   // Boost next crafting action (out-of-combat)
'gather_boost',  // Boost next gathering action (out-of-combat)
'pet_command',   // Command active pet (out-of-combat usable)
```

Note: `fear` can map to the existing `cc` dispatch handler with effectType `'slow'` or a new `'fear'` effect type. A dedicated `fear` kind provides semantic clarity in the LLM prompt and lets the engine apply fear-specific behavior (e.g., enemy runs, cannot act).

### Recommended Project Structure for New Files

No new files strictly required. Changes span existing files:

```
spacetimedb/src/
├── data/
│   ├── mechanical_vocabulary.ts  — Add new ABILITY_KINDS, EFFECT_TYPES (fear, haste)
│   └── llm_prompts.ts            — Add buildRenownPerkSystemPrompt, update SKILL_GENERATION_SCHEMA
├── helpers/
│   ├── combat.ts                 — Add dispatch cases for new kinds; fix debuff pure-path
│   ├── combat_rewards.ts         — Change evenLevels → allLevels in computeRacialAtLevelFromRow
│   └── renown.ts                 — Update awardRenown to insert pending_renown_perk
├── schema/
│   └── tables.ts                 — Add source+abilityKey to AbilityTemplate; add PendingRenownPerk table
├── data/
│   └── races.ts                  — Add raceAbilityKind, raceAbilityKey per race
└── reducers/
    ├── renown.ts                 — Update choose_perk to work with ability_template rows
    └── intent.ts                 — Update 'race' display to show heritage bonus every level
```

### Pattern 1: Pure Buff/Debuff Outside Combat

**What:** Buff abilities (kind=`buff`, targetRule=`self` or `single_ally`) must fire outside combat. Debuff abilities (kind=`debuff`) that currently have 75% direct damage component need a pure path.

**Current code (combat.ts `debuff` handler):**
```typescript
// Line ~685 — always computes directDamage:
const directDamage = (power * 75n) / 100n; // 75% direct, 25% budget to debuff
```

**Fix:** Check if there is a valid enemy target. If combatId is null and targetRule is `single_enemy`, skip damage, apply only the effect:
```typescript
if (kind === 'debuff') {
  const eType = ability.effectType ?? 'armor_down';
  const eMag = ability.effectMagnitude ?? 3n;
  const eDur = ability.effectDuration ?? 3n;

  // Pure debuff: no damage if outside combat or if value1 === 0
  const isPureDebuff = !combatId || ability.value1 === 0n;
  const directDamage = isPureDebuff ? 0n : (scaledPower() * 75n) / 100n;

  // ... rest of handler
}
```

**Out-of-combat casting:** The `executeAbility` function calls `activeCombatIdForCharacter`. When combatId is null, resolveAbility is passed `null`. The dispatch handlers for `buff` and `debuff` already support null combatId for character-targeting effects. The cast_ability reducer currently does not block non-combat casts — it only blocks if in combat for certain kinds. Verify this: the reducer checks `if (!ability || ability.kind === 'utility')` to cancel casts on combat end — meaning utility is the out-of-combat-only kind. Buffs and debuffs targeted at self/ally do not require combatId and will resolve fine.

**What actually needs fixing:** The `debuff` handler throws `SenderError('No target')` when combatId is null AND targetRule is enemy-targeted. Pure player-targeted debuffs on enemies obviously require combat. The fix is: pure buffs to self/ally already work. Pure debuffs need the `isPureDebuff` check above. No structural change needed for out-of-combat buffs — they work today.

### Pattern 2: Race Abilities as Seeded ability_template Rows

**What:** Each race gets one functional ability_template row seeded with characterId=0n (a sentinel meaning "racial" — shared across all characters of that race). At character creation or level-up, the server grants a copy to the character (characterId=character.id) if they match the race.

**Recommended pattern — per-character grant at creation:**
```typescript
// In ensureRaces or after character creation:
function grantRaceAbility(ctx: any, character: any, raceRow: any) {
  // Check if character already has this race ability
  const existing = [...ctx.db.ability_template.by_character.filter(character.id)]
    .find(a => a.abilityKey === raceRow.abilityKey);
  if (existing) return;

  ctx.db.ability_template.insert({
    id: 0n,
    characterId: character.id,
    name: raceRow.abilityName,
    description: raceRow.abilityDescription,
    kind: raceRow.abilityKind,
    targetRule: raceRow.abilityTargetRule,
    resourceType: 'none',
    resourceCost: 0n,
    castSeconds: 0n,
    cooldownSeconds: raceRow.abilityCooldownSeconds,
    scaling: 'none',
    value1: raceRow.abilityValue,
    levelRequired: 1n,
    isGenerated: false,
    source: 'Race',
    abilityKey: raceRow.abilityKey,
  });
}
```

**Race ability table additions** in `races.ts`:
```typescript
// Add to each RACE_DATA entry:
abilityName: string;           // e.g. 'Trollish Regen'
abilityDescription: string;   // sardonic Keeper description
abilityKind: string;          // e.g. 'hot', 'utility', 'buff'
abilityTargetRule: string;    // e.g. 'self'
abilityCooldownSeconds: bigint; // e.g. 300n (5 minutes)
abilityValue: bigint;         // power value
abilityKey: string;           // unique key e.g. 'race_troll_regen'
```

**Suggested race abilities (minor, design discretion):**
- Human: `buff` — "Diplomatic Poise" — temporary CHA boost (+2 CHA, 60s, 5m cd)
- Eldrin: `buff` — "Arcane Attunement" — brief mana regen spike (5m cd)
- Ironclad: `buff` — "Iron Skin" — armor buff (3 AC, 30s, 5m cd)
- Wyldfang: `utility` — "Predator's Sprint" — travel speed/cooldown reduction (5m cd)
- Goblin: `buff` — "Mana Sight" — perception boost (+50 perception, 30s, 5m cd)
- Troll: `hot` — "Trollish Regeneration" — strong HoT (long cd, e.g. 10m)
- Dwarf: `buff` — "Stone Stance" — bonus HP shield (10m cd)
- Gnome: `buff` — "Tinkerer's Focus" — int buff (+2 INT, 60s, 5m cd)
- Halfling: `utility` — "Lucky Roll" — next dodge guaranteed (5m cd)
- Half-Elf: `buff` — "Versatile Blood" — both str and int buff (+1 each, 60s, 5m cd)
- Orc: `buff` — "Bloodrager" — phys damage bonus (5m cd)
- Dark-Elf: `buff` — "Shadow Cloak" — dodge bonus (5m cd)
- Half-Giant: `buff` — "Titan's Will" — taunt all enemies (3m cd)
- Cyclops: `execute` — "Singular Focus" — bonus damage on focused target (3m cd)
- Satyr: `hot` — "Wild Dance" — party HoT (5m cd)

### Pattern 3: Heritage Bonus Every Level

**What:** Currently in `computeRacialAtLevelFromRow`, levelBonus uses `evenLevels = level / 2n`. Change to apply every level.

**Current (combat_rewards.ts):**
```typescript
const evenLevels = level / 2n;
// ... later:
if (evenLevels > 0n) {
  applyType(raceRow.levelBonusType, raceRow.levelBonusValue * evenLevels);
}
```

**Fix:**
```typescript
// Remove evenLevels computation; apply levelBonus every level
if (level > 0n) {
  applyType(raceRow.levelBonusType, raceRow.levelBonusValue * level);
}
```

**WARNING:** This will double-approximately the accumulated heritage bonus for existing high-level characters when the module republishes. The per-level values in races.ts are small (e.g., Eldrin gets +2 max_mana per even level = +1 per level effective). At level 20, previously 10 applications, now 20 applications. Values may need halving to compensate. The planner should note this tradeoff.

**Display during creation (intent.ts):** The races command currently shows:
```
Level Bonus (every 2 levels): ...
```
Must change to `Level Bonus (every level)` and recalculate totals using the new formula.

**Display during level-up (index.ts):** Level-up message currently fires only on even levels:
```typescript
if (newLevel % 2n === 0n && raceRow) {
  appendPrivateEvent(..., `Your ${raceRow.name} heritage grows stronger at level ${newLevel}.`);
}
```
Remove the even-level gate — fire every level.

### Pattern 4: Renown Perks as Dynamic Ability System

**What:** Replace static RENOWN_PERK_POOLS with LLM-generated ability choices at rank-up, using a `pending_renown_perk` table mirroring `pending_skill`.

**New table schema:**
```typescript
export const PendingRenownPerk = table(
  {
    name: 'pending_renown_perk',
    public: true,
    indexes: [{ accessor: 'by_character', algorithm: 'btree', columns: ['characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    characterId: t.u64(),
    rank: t.u64(),
    // Same fields as PendingSkill (LLM-generated ability data):
    name: t.string(),
    description: t.string(),
    kind: t.string(),
    targetRule: t.string(),
    resourceType: t.string(),
    resourceCost: t.u64(),
    castSeconds: t.u64(),
    cooldownSeconds: t.u64(),
    scaling: t.string(),
    value1: t.u64(),
    value2: t.u64().optional(),
    damageType: t.string().optional(),
    effectType: t.string().optional(),
    effectMagnitude: t.u64().optional(),
    effectDuration: t.u64().optional(),
    // Renown-specific: non-combat perk effects (passive bonuses)
    perkEffectJson: t.string().optional(), // JSON-encoded passive bonus (gather, vendor, etc.)
    perkDomain: t.string().optional(),     // 'combat' | 'crafting' | 'social'
    createdAt: t.timestamp(),
  }
);
```

**New reducer:** `choose_renown_perk { characterId, perkId }` — mirrors `choose_skill`. If perk has non-null `perkEffectJson`, stores into `renown_perk` table (existing). If perk has ability fields, inserts into `ability_template` with `source = 'Renown'`.

**LLM flow at rank-up:**
1. `awardRenown` detects rank increase
2. Inserts `LlmTask` row with `taskType = 'renown_perk_gen'`
3. Client `useLlmProxy` sees task, calls proxy with `buildRenownPerkSystemPrompt`
4. LLM returns 3 perk options
5. Client submits via `submit_renown_perk_result` reducer
6. Server inserts 3 `pending_renown_perk` rows
7. Client sees pending rows → shows perk selection UI in Renown panel
8. Player calls `choose_renown_perk` → perk applied, pending rows cleared

**Backwards compatibility:** The static RENOWN_PERK_POOLS can remain as a fallback for existing chosen perks in `renown_perk` table. The `getPerkBonusByField` helper still needs to read those. For new ranks, LLM-generated perks go into ability_template (for actives) or a new `renown_passive` table approach.

**Simpler approach (recommend for this phase):** Keep the `renown_perk` table for passive bonuses. For active abilities from renown, insert into `ability_template` with `source = 'Renown'`. The LLM generates either:
- A passive perk: `{ perkEffectJson: {...}, kind: null }` — stored in renown_perk as before
- An active ability: full ability fields — stored in ability_template with source='Renown'

### Pattern 5: Ability Source Tracking (ABIL-10)

**What:** Add `source` column to `ability_template` for UI display and filtering.

**Schema change:**
```typescript
// In AbilityTemplate table:
source: t.string().optional(), // 'Class' | 'Renown' | 'Race'
abilityKey: t.string().optional(), // stable key for race/renown abilities (not LLM-generated)
```

**Migration:** Existing ability_template rows (all LLM-generated class abilities) have no source. Default to `'Class'` when null. The client can show `source ?? 'Class'` in the abilities panel.

### Anti-Patterns to Avoid

- **Do NOT add combat-only enforcement in resolveAbility for new kinds** — the existing `combatId` null check is sufficient; buff/debuff kinds already handle null combatId for character targets
- **Do NOT create per-race ability tables** — use ability_template with `source='Race'` and `abilityKey='race_{racename}_{ability}'`
- **Do NOT re-implement RENOWN_PERK_POOLS with hardcoded entries for new ranks** — the decision is to go LLM-driven
- **Do NOT add kind-specific client dispatch** — the client calls `cast_ability` reducer; the server resolves by kind; no client-side kind switching needed
- **Do NOT enumerate LLM-generated ability kinds in the CREATION_ABILITY_SCHEMA** — keep it separate from the new kinds (songs, auras, travel are unlikely to be character creation abilities; they're for level-up skill gen)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Validating new ability kinds | Custom validation switch | Add to `ABILITY_KINDS_SET` in skill_budget.ts | Already validated there |
| LLM JSON parsing for renown perks | Custom parser | Reuse `parseSkillGenResult` + `processGeneratedSkill` | Existing path has error handling |
| Out-of-combat buff casting | New reducer | `cast_ability` already supports null combatId path via `executeAbility` | Proven pattern |
| Race ability cooldown tracking | New table | `ability_cooldown` already tracks cooldowns by `abilityTemplateId` | Works for any ability |
| Passive perk application | New aggregate | `getPerkBonusByField` + `calculatePerkBonuses` | Already read by stat computation |
| Heritage bonus display | New API endpoint | The `races` intent command already calls `computeRacialAtLevelFromRow` | Just update the formula |

---

## Common Pitfalls

### Pitfall 1: Heritage Bonus Inflation for Existing Characters
**What goes wrong:** Changing `evenLevels` to `level` doubles heritage bonus accumulation for all existing characters at their current level. A level-20 Eldrin goes from +20 max_mana to +40 max_mana instantly.
**Why it happens:** The bonus is computed from the character's current level, not stored incrementally.
**How to avoid:** Either (a) halve the `levelBonusValue` for each race in races.ts to compensate, or (b) add a migration that adjusts existing characters. Option (a) is simpler — the planner should pick values such that the "effective per-2-level" rate stays similar. Example: Eldrin's `levelBonusValue: 2n` becomes `1n`, so at level 20: 1 * 20 = 20 (same as 2 * 10 before).
**Warning signs:** Players report sudden max_mana spikes after publish.

### Pitfall 2: Pure Debuff on Enemy Requires Active Combat
**What goes wrong:** A debuff ability with `targetRule: 'single_enemy'` throws `SenderError('No target')` when cast outside combat because findEnemyTarget() returns null when combatId is null.
**Why it happens:** The debuff handler calls `findEnemyTarget()` then throws if no enemy.
**How to avoid:** Debuffs with `targetRule: 'single_enemy'` are inherently combat-only. Document in LLM prompt: debuffs targeting enemies require combat. Out-of-combat debuffs must target self (`targetRule: 'self'`, effectType like `'slow'` does nothing without an enemy).
**Warning signs:** Player casts fear/slow outside combat and gets an error instead of a graceful message.

### Pitfall 3: Schema Changes Require Clear-Database Republish
**What goes wrong:** Adding columns to `ability_template` (source, abilityKey) or adding new tables (PendingRenownPerk) requires `--clear-database` on publish. This erases all player data.
**Why it happens:** SpacetimeDB WASM modules cannot migrate existing tables — schema changes require a full rebuild.
**How to avoid:** Make all new columns `.optional()` so existing rows don't break. New tables just appear empty. Use `--clear-database` only in development. For production (maincloud), the user must decide timing.
**Warning signs:** Publish fails with schema mismatch errors.

### Pitfall 4: Songs/Auras Without Toggle Mechanics
**What goes wrong:** Songs are described as "toggle-on/off" abilities. SpacetimeDB has no built-in toggle state — a naive implementation just applies a buff once with no way to cancel.
**Why it happens:** The ability system was designed for one-shot effects, not persistent toggles.
**How to avoid:** Implement songs as long-duration buffs (e.g., effectDuration=600s = 10 minutes) with a "cancel song" command that removes the character_effect. The LLM-generated song kind dispatches to the `buff` handler with a very long duration. Do not build a toggle table unless the planner determines it's necessary.
**Warning signs:** Players cast a song twice and it stacks instead of cancelling.

### Pitfall 5: Renown Perk LLM Flow vs. Static Fallback
**What goes wrong:** The LLM task system has budget limits. If the LLM budget is exhausted at rank-up, the player gets a rank but no perk choices.
**Why it happens:** `checkBudget` in index.ts limits LLM calls. Renown rank-ups are relatively rare but could coincide with other LLM tasks.
**How to avoid:** Keep a minimal static fallback for renown perks (3 universal options per tier) that fires when the LLM task cannot be created. The LLM flow is the primary path; the fallback is the safety net.
**Warning signs:** Player reaches rank 2 and has no pending perks, no LLM error message.

### Pitfall 6: group_heal Already Referenced but Not in ABILITY_KINDS
**What goes wrong:** `hasHealingAbilities()` in combat.ts checks `ability.kind === 'group_heal'`, but `group_heal` is not in the ABILITY_KINDS enum. The skill_budget validator rejects it with a fallback to `'damage'`.
**Why it happens:** The kind was added to the combat helper without being added to the mechanical vocabulary or skill budget.
**How to avoid:** Add `group_heal` to ABILITY_KINDS and BASE_BUDGET in skill_budget.ts. Also add a dispatch case in resolveAbility (heal all party members). This is also required by ABIL-02.

---

## Code Examples

### resolveAbility: New Kind Dispatch Cases

```typescript
// Source: spacetimedb/src/helpers/combat.ts — add after 'utility' handler

if (kind === 'song' || kind === 'aura') {
  // Songs and auras: apply a long-duration buff to self or party
  // Treat identically to 'buff' but always target self + party
  const eType = ability.effectType ?? 'damage_up';
  const eMag = ability.effectMagnitude ?? 3n;
  const eDur = ability.effectDuration ?? 180n; // 3-minute default
  const members = getPartyMembers();
  for (const member of members) {
    addCharacterEffect(ctx, member.id, eType, eMag, eDur, ability.name);
  }
  if (actor.type === 'character') {
    const char = ctx.db.character.id.find(actor.id);
    if (char) logPrivate(char.id, char.ownerUserId, 'ability', `You begin ${ability.name}.`);
    logGroup('ability', `${actor.name} begins ${ability.name}.`);
  }
  return;
}

if (kind === 'fear') {
  // Fear: CC debuff on enemy — maps to cc handler with stun-like effect
  const enemy = findEnemyTarget();
  if (!enemy || !combatId) { throw new SenderError('No target'); }
  const eDur = ability.effectDuration ?? 3n;
  addEnemyEffect(ctx, combatId, enemy.id, 'stun', 0n, eDur, ability.name, actor.id);
  const char = actor.type === 'character' ? ctx.db.character.id.find(actor.id) : null;
  if (char) logPrivate(char.id, char.ownerUserId, 'ability', `Your ${ability.name} fills ${getEnemyName(enemy)} with dread.`);
  logGroup('ability', `${actor.name}'s ${ability.name} fills ${getEnemyName(enemy)} with dread.`);
  return;
}

if (kind === 'group_heal') {
  // AoE heal for party members at caster's location
  const members = getPartyMembers();
  if (members.length === 0) return;
  const power = scaledPower();
  const healAmount = calculateHealingPower(power, actor.stats);
  const scaled = (healAmount * HEALING_POWER_SCALER) / 100n > 0n ? (healAmount * HEALING_POWER_SCALER) / 100n : 1n;
  for (const member of members) {
    const varied = applyVariance(scaled, nowMicros + actor.id + member.id);
    const nextHp = member.hp + varied > member.maxHp ? member.maxHp : member.hp + varied;
    ctx.db.character.id.update({ ...member, hp: nextHp });
    logPrivate(member.id, member.ownerUserId, 'heal', `${ability.name} restores ${varied} health to you.`);
  }
  if (actorGroupId) appendGroupEvent(ctx, actorGroupId, actor.id, 'heal', `${actor.name}'s ${ability.name} heals the group.`);
  return;
}

if (kind === 'bandage' || kind === 'potion') {
  // Consumable-like: instant or short-cast heal/buff on self, no combat restriction
  // Treat as heal + optional buff effect
  const target = actor.type === 'character' ? ctx.db.character.id.find(actor.id) : null;
  if (!target) return;
  const power = scaledPower();
  const healAmount = calculateHealingPower(power, actor.stats);
  const scaled = (healAmount * HEALING_POWER_SCALER) / 100n > 0n ? (healAmount * HEALING_POWER_SCALER) / 100n : 1n;
  const nextHp = target.hp + scaled > target.maxHp ? target.maxHp : target.hp + scaled;
  ctx.db.character.id.update({ ...target, hp: nextHp });
  if (ability.effectType) {
    addCharacterEffect(ctx, target.id, ability.effectType, ability.effectMagnitude ?? 5n, ability.effectDuration ?? 3n, ability.name);
  }
  logPrivate(target.id, target.ownerUserId, 'heal', `You use ${ability.name}, restoring ${scaled} health.`);
  return;
}

if (kind === 'travel') {
  // Travel ability: apply travel-related buff (speed boost, location reveal, etc.)
  const target = actor.type === 'character' ? ctx.db.character.id.find(actor.id) : null;
  if (!target) return;
  const eType = ability.effectType ?? 'faction_bonus'; // use existing effect type
  const eMag = ability.effectMagnitude ?? 5n;
  const eDur = ability.effectDuration ?? 30n;
  addCharacterEffect(ctx, target.id, eType, eMag, eDur, ability.name);
  logPrivate(target.id, target.ownerUserId, 'ability', `You activate ${ability.name}.`);
  return;
}

if (kind === 'craft_boost' || kind === 'gather_boost') {
  // Crafting/gathering boost: apply a loot_bonus or similar effect before non-combat action
  const target = actor.type === 'character' ? ctx.db.character.id.find(actor.id) : null;
  if (!target) return;
  const eType = kind === 'craft_boost' ? 'loot_bonus' : 'loot_bonus';
  const eMag = ability.effectMagnitude ?? 10n;
  const eDur = ability.effectDuration ?? 3n; // 1 tick = enough for one crafting action
  addCharacterEffect(ctx, target.id, eType, eMag, eDur, ability.name);
  logPrivate(target.id, target.ownerUserId, 'ability', `You focus with ${ability.name}.`);
  return;
}
```

### Heritage Bonus: Every Level Fix

```typescript
// Source: spacetimedb/src/helpers/combat_rewards.ts
// BEFORE:
const evenLevels = level / 2n;
// ...
if (evenLevels > 0n) {
  applyType(raceRow.levelBonusType, raceRow.levelBonusValue * evenLevels);
}

// AFTER (also halve levelBonusValue in races.ts to keep similar power):
if (level > 0n) {
  applyType(raceRow.levelBonusType, raceRow.levelBonusValue * level);
}
```

### skill_budget.ts: Add New Kind Budgets

```typescript
// Source: spacetimedb/src/helpers/skill_budget.ts
const BASE_BUDGET: Record<string, ...> = {
  // ... existing entries ...
  group_heal:   { base: 6,  perLevel: 2, minMult: 0.6, maxMult: 1.2 },
  song:         { base: 4,  perLevel: 1, minMult: 0.5, maxMult: 1.5 },
  aura:         { base: 3,  perLevel: 1, minMult: 0.5, maxMult: 2.0 },
  travel:       { base: 5,  perLevel: 2, minMult: 0.5, maxMult: 2.0 },
  fear:         { base: 2,  perLevel: 1, minMult: 0.5, maxMult: 1.5 },
  bandage:      { base: 8,  perLevel: 3, minMult: 0.7, maxMult: 1.3 },
  potion:       { base: 10, perLevel: 4, minMult: 0.7, maxMult: 1.3 },
  food_summon:  { base: 5,  perLevel: 2, minMult: 0.5, maxMult: 2.0 },
  resurrect:    { base: 1,  perLevel: 0, minMult: 1.0, maxMult: 1.0 },
  craft_boost:  { base: 5,  perLevel: 2, minMult: 0.5, maxMult: 2.0 },
  gather_boost: { base: 5,  perLevel: 2, minMult: 0.5, maxMult: 2.0 },
  pet_command:  { base: 5,  perLevel: 2, minMult: 0.5, maxMult: 2.0 },
};
```

---

## State of the Art

| Old Approach | Current Approach | Change Needed | Impact |
|--------------|------------------|--------------|--------|
| 106-case hardcoded ability switch | Kind-based dispatch in resolveAbility | Add new kind cases | Minimal — fallback already exists |
| Heritage bonus every even level | Change to every level | One-line formula change + halve values | Existing characters get adjusted bonuses |
| Static RENOWN_PERK_POOLS | LLM-driven pending_renown_perk | New table + reducer + LLM prompt | Medium complexity — follows pending_skill pattern |
| Renown perks as bespoke objects | Perks as ability_template rows | Add source column to ability_template | Schema change — requires optional columns |
| Race abilities: narrative only | Race abilities as ability_template rows | Seed in ensureRaces | Clear pattern — no new infrastructure |

---

## Open Questions

1. **Song toggle cancellation**
   - What we know: Songs apply a long-duration buff. No cancel mechanism exists.
   - What's unclear: Do players need to actively cancel songs, or does duration expiry suffice?
   - Recommendation: Start with long-duration buffs (180s). Add `cancel_song` command if players request it.

2. **Renown perk LLM fallback**
   - What we know: LLM budget can be exhausted. Static perks exist in RENOWN_PERK_POOLS.
   - What's unclear: Should the static fallback apply at all ranks, or only as a last resort?
   - Recommendation: Keep RENOWN_PERK_POOLS for ranks 2–9 as fallback. LLM is primary for 10+.

3. **Heritage bonus inflation for existing characters**
   - What we know: Changing even→every level doubles accumulated bonuses.
   - What's unclear: Do existing characters need a one-time correction on next login?
   - Recommendation: Halve levelBonusValue in races.ts. computeRacialAtLevelFromRow is called on every level-up and recomputed from scratch, so the correction happens automatically at next level-up.

4. **Race abilities for LLM-generated races**
   - What we know: Players can create custom races during character creation. RACE_DATA only covers predefined races.
   - What's unclear: Do LLM-generated races also get race abilities?
   - Recommendation: For this phase, only RACE_DATA races get abilities. LLM-generated races get no race ability (they are already creative with their stat bonuses). Deferred.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.1 |
| Config file | `spacetimedb/package.json` scripts.test |
| Quick run command | `cd spacetimedb && npm test` |
| Full suite command | `cd spacetimedb && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ABIL-01 | ABILITY_KINDS includes all new kinds | unit | `cd spacetimedb && npm test -- mechanical_vocabulary` | ❌ Wave 0 |
| ABIL-02 | resolveAbility dispatches new kinds without throwing | unit | `cd spacetimedb && npm test -- combat.test` | ✅ add cases |
| ABIL-03 | parseSkillGenResult accepts new kinds without defaulting | unit | `cd spacetimedb && npm test -- skill_gen` | ❌ Wave 0 |
| ABIL-04 | Client dispatch — no server-side kind logic required for client | n/a (manual smoke) | N/A | N/A |
| ABIL-05 | Pure buff applies without damage; pure debuff applies without damage | unit | `cd spacetimedb && npm test -- combat.test` | ✅ add cases |
| ABIL-06 | grantRaceAbility inserts ability_template row with source='Race' | unit | `cd spacetimedb && npm test -- race_ability` | ❌ Wave 0 |
| ABIL-07 | computeRacialAtLevelFromRow applies bonus every level (not every 2) | unit | `cd spacetimedb && npm test -- combat_rewards` | ❌ Wave 0 |
| ABIL-08 | choose_renown_perk inserts ability_template with source='Renown' | unit | `cd spacetimedb && npm test -- renown` | ❌ Wave 0 |
| ABIL-09 | pending_renown_perk row exists after rank-up | unit | `cd spacetimedb && npm test -- renown` | ❌ Wave 0 |
| ABIL-10 | ability_template source field present and correct value | unit | `cd spacetimedb && npm test -- ability_source` | ❌ Wave 0 |
| ABIL-11 | buildRenownPerkSystemPrompt returns non-empty string | unit | `cd spacetimedb && npm test -- llm_prompts` | ✅ add case |

### Sampling Rate

- **Per task commit:** `cd spacetimedb && npm test`
- **Per wave merge:** `cd spacetimedb && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `spacetimedb/src/data/mechanical_vocabulary.test.ts` — validates ABILITY_KINDS contains all required entries (ABIL-01)
- [ ] `spacetimedb/src/helpers/skill_gen.test.ts` — validates parseSkillGenResult handles new kinds (ABIL-03)
- [ ] `spacetimedb/src/helpers/combat_rewards.test.ts` — validates computeRacialAtLevelFromRow applies every level (ABIL-07)
- [ ] `spacetimedb/src/helpers/race_ability.test.ts` — validates grantRaceAbility inserts correct row (ABIL-06)
- [ ] `spacetimedb/src/reducers/renown.test.ts` — validates pending_renown_perk insertion and choose_renown_perk (ABIL-08, ABIL-09)
- [ ] Add cases to `spacetimedb/src/helpers/combat.test.ts` — pure buff outside combat, pure debuff, new kind dispatch (ABIL-02, ABIL-05)
- [ ] Add case to `spacetimedb/src/data/llm_prompts.test.ts` — buildRenownPerkSystemPrompt (ABIL-11)
- [ ] Add case to `spacetimedb/src/helpers/combat.test.ts` — source field verified on ability_template insert (ABIL-10)

---

## Sources

### Primary (HIGH confidence)

- Direct code read: `spacetimedb/src/helpers/combat.ts` — resolveAbility dispatch, executeAbility, kind handlers
- Direct code read: `spacetimedb/src/data/mechanical_vocabulary.ts` — ABILITY_KINDS, EFFECT_TYPES, all vocabulary
- Direct code read: `spacetimedb/src/helpers/skill_budget.ts` — BASE_BUDGET, validateSkillFields
- Direct code read: `spacetimedb/src/helpers/skill_gen.ts` — parseSkillGenResult, insertPendingSkills
- Direct code read: `spacetimedb/src/data/llm_prompts.ts` — SKILL_GENERATION_SCHEMA, CREATION_ABILITY_SCHEMA
- Direct code read: `spacetimedb/src/helpers/combat_rewards.ts` — computeRacialAtLevelFromRow, evenLevels formula
- Direct code read: `spacetimedb/src/index.ts` — apply_level_up reducer, level-up heritage notification
- Direct code read: `spacetimedb/src/data/renown_data.ts` — RENOWN_PERK_POOLS, PerkEffect type
- Direct code read: `spacetimedb/src/helpers/renown.ts` — awardRenown, getPerkBonusByField
- Direct code read: `spacetimedb/src/reducers/renown.ts` — choose_perk reducer
- Direct code read: `spacetimedb/src/schema/tables.ts` — AbilityTemplate, PendingSkill, Character schemas
- Direct code read: `spacetimedb/src/data/races.ts` — RACE_DATA structure, levelBonusType/Value
- Direct code read: `spacetimedb/src/reducers/intent.ts` — races command display (heritage text)

### Secondary (MEDIUM confidence)

- Project CONTEXT.md decisions — all implementation decisions are locked by user
- Project MEMORY.md — SpacetimeDB bigint gotchas, no auto-publish to maincloud

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all code read directly
- Architecture: HIGH — patterns are direct extensions of existing working code
- Pitfalls: HIGH — derived from actual code reading (heritage inflation confirmed by formula, group_heal gap confirmed by grep)
- LLM prompt design: MEDIUM — structure is clear, exact prompt wording is Claude's discretion

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (SpacetimeDB SDK 1.11.x stable; internal codebase changes most likely to affect this)
