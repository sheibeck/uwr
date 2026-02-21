---
phase: quick-252
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/reducers/combat.ts
  - src/App.vue
  - src/components/GroupPanel.vue
autonomous: true
requirements: [QUICK-252]

must_haves:
  truths:
    - "Primal Titan heals all living party members each tick (not just lowest HP)"
    - "All enemies in combat switch aggro to Primal Titan on summon"
    - "GroupPanel shows a live countdown for pets with expiresAtMicros set"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "pet_aoe_heal case in executePetAbility + AoE aggro in summonPet"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "out-of-combat pet_aoe_heal tick loop"
    - path: "src/App.vue"
      provides: "expiresAtMicros forwarded in combatPetsForGroup"
    - path: "src/components/GroupPanel.vue"
      provides: "countdown display on pet cards"
  key_links:
    - from: "executePetAbility pet_aoe_heal"
      to: "combatParticipant table"
      via: "by_combat index iteration — heals ALL members, not just lowest"
    - from: "summonPet aggro block"
      to: "combatEnemy table"
      via: "by_combat index — inserts AggroEntry + sets aggroTargetPetId on ALL enemies"
    - from: "GroupPanel pet card"
      to: "expiresAtMicros prop"
      via: "Math.ceil((expiresAtMicros - nowMicros) / 1_000_000)"
---

<objective>
Implement three Primal Titan features: AoE party heal ability, AoE aggro on summon, and a live countdown timer in the GroupPanel pet display.

Purpose: Complete the Primal Titan's unique kit — it should protect the group by healing everyone and drawing all enemy attention on entry.
Output: Updated combat.ts (server), reducers/combat.ts (server), App.vue and GroupPanel.vue (client).
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/helpers/combat.ts
@spacetimedb/src/reducers/combat.ts
@src/App.vue
@src/components/GroupPanel.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add pet_aoe_heal to executePetAbility and summonPet AoE aggro</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
**Part A — pet_aoe_heal in executePetAbility (around line 2192, right before the enemy-target guard):**

Insert a new `if (abilityKey === 'pet_aoe_heal')` block immediately after the closing brace of the `pet_heal` block (around line 2228) and BEFORE the `const target = ...` / enemy-target guard at line 2230. Pattern is identical to `pet_heal` but heals ALL living, injured party members instead of just the lowest-HP one:

```typescript
if (abilityKey === 'pet_aoe_heal') {
  const healAmount = 10n + pet.level * 5n;
  let healedCount = 0n;

  // Heal owner first if injured
  if (owner.hp > 0n && owner.hp < owner.maxHp) {
    const newHp = owner.hp + healAmount > owner.maxHp ? owner.maxHp : owner.hp + healAmount;
    ctx.db.character.id.update({ ...owner, hp: newHp });
    healedCount++;
  }

  // Heal all active combat participants (party members)
  for (const participant of ctx.db.combatParticipant.by_combat.filter(combatId)) {
    if (participant.status !== 'active') continue;
    const member = ctx.db.character.id.find(participant.characterId);
    if (!member || member.hp === 0n || member.hp >= member.maxHp) continue;
    if (member.id === owner.id) continue; // already healed above
    const newHp = member.hp + healAmount > member.maxHp ? member.maxHp : member.hp + healAmount;
    ctx.db.character.id.update({ ...member, hp: newHp });
    healedCount++;
  }

  if (healedCount === 0n) return false; // Nothing to heal

  const message = `${pet.name} heals the party for ${healAmount}!`;
  appendPrivateEvent(ctx, owner.id, owner.ownerUserId, 'ability', message);
  if (actorGroupId) {
    appendGroupEvent(ctx, actorGroupId, owner.id, 'ability', message);
  }
  return true;
}
```

**Part B — AoE aggro in summonPet (around line 462):**

The current aggro block is:
```typescript
if (inActiveCombat && character.className?.toLowerCase() === 'summoner' && ability?.key === 'pet_taunt') {
  // ... single enemy aggro insert
}
```

Add a new `else if` for `pet_aoe_heal` immediately after the closing brace of the `pet_taunt` block:
```typescript
} else if (inActiveCombat && ability?.key === 'pet_aoe_heal') {
  // Primal Titan draws aggro from ALL enemies on summon
  for (const combatEnemy of ctx.db.combatEnemy.by_combat.filter(combatId!)) {
    if (combatEnemy.currentHp === 0n) continue; // skip dead enemies
    ctx.db.aggroEntry.insert({
      id: 0n,
      combatId: combatId!,
      enemyId: combatEnemy.id,
      characterId: character.id,
      petId: pet.id,
      value: SUMMONER_PET_INITIAL_AGGRO,
    });
    ctx.db.combatEnemy.id.update({
      ...combatEnemy,
      aggroTargetPetId: pet.id,
      aggroTargetCharacterId: character.id,
    });
  }
}
```

Note: `ctx.db.combatEnemy.by_combat` — verify the index name matches what is used elsewhere in the file (search for `combatEnemy.by_combat` to confirm). Use the same index pattern as other locations in the file.
  </action>
  <verify>Module compiles: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` (local only). No TypeScript errors reported.</verify>
  <done>Both `pet_aoe_heal` case in executePetAbility and the AoE aggro block in summonPet compile without errors.</done>
</task>

<task type="auto">
  <name>Task 2: Add out-of-combat pet_aoe_heal tick to reducers/combat.ts</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
The out-of-combat `pet_heal` tick loop lives at line ~1384 in reducers/combat.ts. Add a parallel `pet_aoe_heal` loop immediately after it (after the closing brace of the `pet_heal` loop, before the "Watchdog" comment at line ~1445).

The logic mirrors the `pet_heal` out-of-combat loop except:
- Check `pet.abilityKey !== 'pet_aoe_heal'` (not `pet_heal`)
- Heal ALL injured party members at the same location (owner + group members), not just the lowest-HP one
- Log a group event ("heals the party for X!")
- Disarm (set `nextAbilityAt: undefined`) if NO members are injured
- Re-arm cooldown same as `pet_heal`: `(pet.abilityCooldownSeconds ?? 10n) * 1_000_000n`

Also update the three spots that re-arm `pet_heal` on combat exit / flee to also re-arm `pet_aoe_heal`:
1. Line ~334: `nextAbilityAt: pet.abilityKey === 'pet_heal' ? ctx.timestamp.microsSinceUnixEpoch : undefined`
   → Change to: `nextAbilityAt: (pet.abilityKey === 'pet_heal' || pet.abilityKey === 'pet_aoe_heal') ? ctx.timestamp.microsSinceUnixEpoch : undefined`
2. Line ~1958 (flee path): same change — `pet.abilityKey === 'pet_heal'` → `(pet.abilityKey === 'pet_heal' || pet.abilityKey === 'pet_aoe_heal')`

The new out-of-combat loop:
```typescript
// Out-of-combat pet_aoe_heal ability ticks
for (const pet of ctx.db.activePet.iter()) {
  if (pet.abilityKey !== 'pet_aoe_heal') continue;
  if (pet.combatId !== undefined && pet.combatId !== null) continue;
  if (pet.currentHp === 0n) continue;
  if (!pet.nextAbilityAt) continue;
  if (pet.nextAbilityAt > ctx.timestamp.microsSinceUnixEpoch) continue;

  const petOwner = ctx.db.character.id.find(pet.characterId);
  if (!petOwner || petOwner.hp === 0n) continue;

  const groupId = petOwner.groupId ?? null;
  const healAmount = 10n + pet.level * 5n;
  let healedCount = 0n;

  // Heal owner if injured
  if (petOwner.hp > 0n && petOwner.hp < petOwner.maxHp) {
    const newHp = petOwner.hp + healAmount > petOwner.maxHp ? petOwner.maxHp : petOwner.hp + healAmount;
    ctx.db.character.id.update({ ...petOwner, hp: newHp });
    healedCount++;
  }

  // Heal group members at same location
  if (groupId) {
    for (const membership of ctx.db.groupMember.by_group.filter(groupId)) {
      const member = ctx.db.character.id.find(membership.characterId);
      if (!member || member.id === petOwner.id) continue;
      if (member.hp === 0n || member.hp >= member.maxHp) continue;
      if (member.locationId !== petOwner.locationId) continue;
      const newHp = member.hp + healAmount > member.maxHp ? member.maxHp : member.hp + healAmount;
      ctx.db.character.id.update({ ...member, hp: newHp });
      healedCount++;
    }
  }

  if (healedCount === 0n) {
    ctx.db.activePet.id.update({ ...pet, nextAbilityAt: undefined });
    continue;
  }

  const healMsg = `${pet.name} heals the party for ${healAmount}!`;
  appendPrivateEvent(ctx, petOwner.id, petOwner.ownerUserId, 'ability', healMsg);
  if (petOwner.groupId) {
    appendGroupEvent(ctx, petOwner.groupId, petOwner.id, 'ability', healMsg);
  }

  const cooldownMicros = (pet.abilityCooldownSeconds ?? 10n) * 1_000_000n;
  ctx.db.activePet.id.update({ ...pet, nextAbilityAt: ctx.timestamp.microsSinceUnixEpoch + cooldownMicros });
}
```
  </action>
  <verify>Module compiles without errors: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` (local only).</verify>
  <done>Out-of-combat tick loop for pet_aoe_heal exists and compiles. Combat-exit re-arm includes both pet_heal and pet_aoe_heal.</done>
</task>

<task type="auto">
  <name>Task 3: Add expiresAtMicros to combatPetsForGroup and countdown display in GroupPanel</name>
  <files>src/App.vue, src/components/GroupPanel.vue</files>
  <action>
**src/App.vue — combatPetsForGroup computed (around line 1021):**

The `combatPetsForGroup` computed maps pet rows to objects. Both the `activeCombat` branch (line ~1032) and the out-of-combat branch (line ~1043) need `expiresAtMicros` added to the mapped object:

```typescript
// In both .map() calls, add:
expiresAtMicros: pet.expiresAtMicros ?? null,
```

So both branches become:
```typescript
.map((pet: any) => ({
  id: pet.id,
  ownerCharacterId: pet.characterId,
  name: pet.name,
  currentHp: pet.currentHp,
  maxHp: pet.maxHp,
  expiresAtMicros: pet.expiresAtMicros ?? null,
}));
```

**src/components/GroupPanel.vue — props interface (around line 208):**

Update the `combatPets` prop type to include `expiresAtMicros`:
```typescript
combatPets: {
  id: bigint;
  combatId?: bigint;
  ownerCharacterId: bigint;
  name: string;
  currentHp: bigint;
  maxHp: bigint;
  expiresAtMicros?: bigint | null;
}[];
```

**src/components/GroupPanel.vue — countdown computed (in `<script setup>`):**

Add a helper function (alongside or near the `petsFor` function at line ~335):
```typescript
function petCountdown(pet: { expiresAtMicros?: bigint | null }): string | null {
  if (!pet.expiresAtMicros) return null;
  const now = props.nowMicros ?? Date.now() * 1000;
  const remainingSeconds = Math.ceil((Number(pet.expiresAtMicros) - now) / 1_000_000);
  if (remainingSeconds <= 0) return 'Expiring...';
  return `${remainingSeconds}s`;
}
```

**src/components/GroupPanel.vue — pet card template (lines ~49-55 and ~130-136):**

Both pet card `<div>` blocks currently show:
```html
<div v-for="pet in petsFor(member.id)" :key="pet.id.toString()" :style="styles.petCard">
  <span>{{ pet.name }}</span>
  <div :style="styles.hpBar">...</div>
</div>
```

Update both to show the countdown after the name when present:
```html
<div v-for="pet in petsFor(member.id)" :key="pet.id.toString()" :style="styles.petCard">
  <span>{{ pet.name }}<template v-if="petCountdown(pet)"> ({{ petCountdown(pet) }})</template></span>
  <div :style="styles.hpBar">
    <div :style="{ ...styles.hpFill, width: `${percent(pet.currentHp, pet.maxHp)}%` }"></div>
    <span :style="styles.barText">{{ pet.currentHp }} / {{ pet.maxHp }}</span>
  </div>
</div>
```

Apply this same change to the solo (non-group) pet block around line 130 as well.

The `nowMicros` prop is already declared at line 207 and already passed from App.vue at line 385. The `petCountdown` function uses `props.nowMicros` which updates every 100ms via App.vue's setInterval — no additional reactive wiring needed.
  </action>
  <verify>Run the dev server (`npm run dev` in `src/` or project root). Open GroupPanel while a Primal Titan is active — its card should show e.g. "Grim (87s)" updating each second. Pets without expiresAtMicros show no countdown.</verify>
  <done>Pet cards in GroupPanel display a live seconds countdown for pets with expiresAtMicros. Countdown updates reactively as nowMicros ticks. Pets without expiry show no extra text.</done>
</task>

</tasks>

<verification>
1. TypeScript compilation: publish to local SpacetimeDB with no errors
2. In-combat: Primal Titan (pet_aoe_heal) heals every participant each tick — check combat log shows "heals the party"
3. On summon: all living enemies show the Titan as their aggro target in combat state
4. GroupPanel: Primal Titan card shows countdown like "(87s)" decrementing each second
5. Water Elemental (pet_heal) card shows no countdown (no expiresAtMicros)
</verification>

<success_criteria>
- pet_aoe_heal heals all injured party members in both in-combat (executePetAbility) and out-of-combat (reducer tick) paths
- summonPet inserts AggroEntry + sets aggroTargetPetId on every living combat enemy when ability key is pet_aoe_heal
- GroupPanel pet cards display "Xs" countdown for pets with expiresAtMicros, blank for others
- No TypeScript errors on publish
</success_criteria>

<output>
After completion, create `.planning/quick/252-primal-titan-aoe-heal-all-enemy-aggro-on/252-SUMMARY.md`
</output>
