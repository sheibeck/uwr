---
phase: quick-363
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/reducers/intent.test.ts
autonomous: true
requirements: [QUEST-VIEW, GATHER-LOOK-FIX]

must_haves:
  truths:
    - "Typing 'quests' shows active quests narratively with progress, giver, description, and clickable [Abandon] / [Turn In] actions"
    - "Gatherables (resource nodes) appear in LOOK output after traveling via intent handler"
    - "Quest items at current location appear in LOOK output"
  artifacts:
    - path: "spacetimedb/src/reducers/intent.ts"
      provides: "quests command, quest items in LOOK, passive search on travel"
    - path: "spacetimedb/src/reducers/intent.test.ts"
      provides: "Tests for quests command and LOOK with quest items"
  key_links:
    - from: "intent.ts quests command"
      to: "quest_instance + quest_template tables"
      via: "by_character index filter"
      pattern: "quest_instance\\.by_character\\.filter"
    - from: "intent.ts travel handler"
      to: "performPassiveSearch"
      via: "import from helpers/search"
      pattern: "performPassiveSearch"
---

<objective>
Add narrative quest viewing via "quests" command, fix gatherables not appearing after travel, and show quest items in LOOK output.

Purpose: Players currently have no way to view quests from the narrative console, and traveling via the intent handler doesn't spawn resource nodes (unlike the movement.ts reducer), so LOOK shows no gatherables.
Output: Updated intent.ts with quests command, travel fix, and LOOK enhancement; tests.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/intent.ts
@spacetimedb/src/reducers/intent.test.ts
@spacetimedb/src/reducers/quests.ts
@spacetimedb/src/helpers/search.ts
@spacetimedb/src/schema/tables.ts (lines 160-273 for QuestTemplate, QuestItem, NamedEnemy, QuestInstance)
</context>

<interfaces>
<!-- Key tables the executor needs -->

QuestInstance: { id, characterId, questTemplateId, progress, completed, acceptedAt, completedAt? }
  indexes: by_character, by_template

QuestTemplate: { id, name, npcId, targetEnemyTemplateId, requiredCount, minLevel, maxLevel, rewardXp, questType?, targetLocationId?, targetNpcId?, targetItemName?, itemDropChance?, description?, rewardType?, rewardItemName?, rewardItemDesc?, rewardGold?, characterId? }
  indexes: by_npc, by_enemy, by_character

QuestItem: { id, characterId, questTemplateId, locationId, name, discovered, looted }
  indexes: by_character, by_location

ResourceNode: { id, locationId, characterId?, itemTemplateId, name, timeOfDay, quantity, state, lockedByCharacterId?, respawnAtMicros? }
  indexes: by_location, by_character

<!-- From helpers/search.ts -->
performPassiveSearch(ctx, character, locationId, appendPrivateEvent) — spawns personal resource nodes + quest items

<!-- From deps -->
ensureSpawnsForLocation(ctx, locationId) — spawns enemy spawns

<!-- Existing deps destructured in registerIntentReducers -->
{ spacetimedb, t, requireCharacterOwnedBy, requirePlayerUserId, appendPrivateEvent, appendLocationEvent, activeCombatIdForCharacter, areLocationsConnected, fail }
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add quests command, fix travel spawning, show quest items in LOOK</name>
  <files>spacetimedb/src/reducers/intent.ts, spacetimedb/src/reducers/intent.test.ts</files>
  <behavior>
    - Test: "quests" command with no active quests returns "No active quests" message
    - Test: "quests" command with active quest shows quest name, progress, giver name
    - Test: "quests" command with completed quest shows [Turn In] link
    - Test: buildLookOutput includes quest items (discovered, not looted) at character's location
    - Test: buildLookOutput still works when no quest items exist (existing tests pass)
  </behavior>
  <action>
    **1. Add `performPassiveSearch` import and call on travel (intent.ts ~line 834):**

    Import `performPassiveSearch` from `'../helpers/search'` at top of file (alongside existing imports from helpers).

    In the travel handler (after line 834 where appendLocationEvent is called, BEFORE the auto-look block at line 836), add:
    ```
    // Spawn enemies and personal resource nodes at destination
    ensureSpawnsForLocation(ctx, matchedLocation.id);
    performPassiveSearch(ctx, arrivedChar, matchedLocation.id, appendPrivateEvent);
    ```

    Note: `ensureSpawnsForLocation` is NOT currently in the destructured deps for registerIntentReducers. Add it to the destructured deps list (it IS available in the deps object passed from index.ts).

    Re-read the character after passive search since it may have updated:
    ```
    const arrivedChar = ctx.db.character.id.find(character.id);
    ```
    (This line already exists at 837, so just move `ensureSpawnsForLocation` and `performPassiveSearch` calls between lines 834 and 836.)

    **2. Add quest items to buildLookOutput (intent.ts, after section 7 Resources, before section 8 Travel exits):**

    Add section 7.5: Quest Items
    ```typescript
    // 7.5 Quest items (discovered but not yet looted)
    const questItems = [...ctx.db.quest_item.by_location.filter(character.locationId)]
      .filter((qi: any) => qi.characterId === character.id && qi.discovered && !qi.looted);
    if (questItems.length > 0) {
      const qiParts = questItems.map((qi: any) =>
        `{{color:#fbbf24}}[Loot ${qi.name}]{{/color}}`
      );
      parts.push(`\nQuest items: ${qiParts.join(', ')}.`);
    }
    ```

    **3. Add "quests" / "q" command handler (intent.ts, add after the "loot" command block ~line 560):**

    Match: `if (lower === 'quests' || lower === 'quest' || lower === 'q')` — BUT "q" currently does nothing in intent.ts (the Q keyboard shortcut opens journal panel on client side, so a server-side "q" command is fine since the input box is what sends to submit_intent).

    Actually, check first — does "q" conflict? The keyboard shortcut opens journal panel directly without sending to server. So "q" as typed text is safe.

    Implementation:
    ```typescript
    if (lower === 'quests' || lower === 'quest') {
      const instances = [...ctx.db.quest_instance.by_character.filter(character.id)];
      if (instances.length === 0) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          'You have no active quests. Speak with NPCs to discover what needs doing.');
        return;
      }

      const parts: string[] = [`Active Quests (${instances.length}/4):`];

      for (const qi of instances) {
        const qt = ctx.db.quest_template.id.find(qi.questTemplateId);
        if (!qt) continue;
        const npc = ctx.db.npc.id.find(qt.npcId);
        const giverName = npc ? npc.name : 'Unknown';
        const location = npc ? ctx.db.location.id.find(npc.locationId) : null;
        const locName = location ? location.name : 'Unknown';

        // Quest type description
        const typeDesc: Record<string, string> = {
          kill: 'Slay', kill_loot: 'Hunt and collect', explore: 'Explore',
          delivery: 'Deliver', boss_kill: 'Defeat', gather: 'Gather',
          escort: 'Escort', interact: 'Interact', discover: 'Discover',
        };
        const verb = typeDesc[(qt.questType ?? 'kill')] || 'Complete';

        const progressStr = `${qi.progress}/${qt.requiredCount}`;
        let statusLine: string;
        if (qi.completed) {
          statusLine = `  {{color:#22c55e}}COMPLETE{{/color}} — Return to {{color:#da77f2}}[${giverName}]{{/color}} at ${locName} to {{color:#22c55e}}[Turn In ${qt.name}]{{/color}}`;
        } else {
          statusLine = `  ${verb}: ${progressStr}`;
          if (qt.targetItemName) statusLine += ` (${qt.targetItemName})`;
        }

        parts.push(`\n{{color:#fbbf24}}${qt.name}{{/color}}`);
        if (qt.description) parts.push(`  ${qt.description}`);
        parts.push(`  Given by: {{color:#da77f2}}[${giverName}]{{/color}} at ${locName}`);
        parts.push(statusLine);
        parts.push(`  {{color:#6b7280}}[Abandon ${qt.name}]{{/color}}`);
      }

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look', parts.join('\n'));
      return;
    }
    ```

    **4. Add "quests" to the help text (intent.ts, help command block ~line 158):**

    Add line: `'  [quests] — View your active quests and progress.',` after the `[loot]` line.

    **5. Add keyword handlers for "Turn In" and "Abandon" quest actions (in the keyword matching section of App.vue):**

    Actually — these should work via the existing keyword click system. "Turn In <quest name>" and "Abandon <quest name>" will be typed into the narrative input. Add server-side handlers in intent.ts:

    After the quests command handler, add:
    ```typescript
    // --- TURN IN <quest name> ---
    if (lower.startsWith('turn in ')) {
      const questName = raw.substring(8).trim();
      if (!questName) return fail(ctx, character, 'Turn in which quest?');

      // Find matching completed quest
      for (const qi of ctx.db.quest_instance.by_character.filter(character.id)) {
        const qt = ctx.db.quest_template.id.find(qi.questTemplateId);
        if (!qt) continue;
        if (qt.name.toLowerCase() !== questName.toLowerCase()) continue;
        if (!qi.completed) {
          return fail(ctx, character, `"${qt.name}" is not yet complete.`);
        }
        // Check if character is at the NPC's location
        const npc = ctx.db.npc.id.find(qt.npcId);
        if (npc && npc.locationId !== character.locationId) {
          return fail(ctx, character, `You must return to ${npc.name} at ${ctx.db.location.id.find(npc.locationId)?.name || 'their location'} to turn in this quest.`);
        }
        // Delegate to turn_in_quest reducer logic (call it directly since we're in the same module)
        // Actually, we can't call another reducer from a reducer. Instead, replicate the reward logic
        // OR simply inform the player to use the turn_in_quest flow.
        // Best approach: have the client handle [Turn In X] by calling the turn_in_quest reducer.
        // So this handler just validates and tells them they can turn it in.
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
          `You present your completed quest "${qt.name}" to ${npc?.name || 'the quest giver'}.`);
        // Actually perform the turn-in inline (same logic as turn_in_quest reducer):
        // Award XP
        const xpReward = qt.rewardXp || 0n;
        if (xpReward > 0n) {
          const freshChar = ctx.db.character.id.find(character.id)!;
          ctx.db.character.id.update({ ...freshChar, xp: freshChar.xp + xpReward });
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
            `Quest "${qt.name}" complete! +${xpReward} XP`);
        }
        // Award gold
        const goldReward = qt.rewardGold || 0n;
        if (goldReward > 0n) {
          const freshChar2 = ctx.db.character.id.find(character.id)!;
          ctx.db.character.id.update({ ...freshChar2, gold: freshChar2.gold + goldReward });
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest', `+${goldReward} gold from quest reward.`);
        }
        // Award NPC affinity
        if (qt.npcId) {
          // Import awardNpcAffinity or use inline
          // Since we can import it:
          awardNpcAffinity(ctx, ctx.db.character.id.find(character.id)!, qt.npcId, 10n);
        }
        // Delete quest instance
        ctx.db.quest_instance.id.delete(qi.id);
        return;
      }
      return fail(ctx, character, `No quest found called "${questName}".`);
    }

    // --- ABANDON <quest name> ---
    if (lower.startsWith('abandon ')) {
      const questName = raw.substring(8).trim();
      if (!questName) return fail(ctx, character, 'Abandon which quest?');

      for (const qi of ctx.db.quest_instance.by_character.filter(character.id)) {
        const qt = ctx.db.quest_template.id.find(qi.questTemplateId);
        if (!qt) continue;
        if (qt.name.toLowerCase() !== questName.toLowerCase()) continue;

        ctx.db.quest_instance.id.delete(qi.id);
        if (qt.npcId) {
          awardNpcAffinity(ctx, character, qt.npcId, -3n);
        }
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
          `Quest abandoned: ${qt.name}. This quest may never be offered again.`);
        return;
      }
      return fail(ctx, character, `No quest found called "${questName}".`);
    }
    ```

    **Import needed:** Add `import { awardNpcAffinity } from '../helpers/npc_affinity';` at top of intent.ts (it's already imported for getAffinityForNpc).

    **6. Wire "Loot <quest item name>" keyword in intent.ts:**

    Add a handler for "loot <item name>" that matches quest items (after the existing "loot" bare command):
    ```typescript
    // --- LOOT <item name> (quest items) ---
    if (lower.startsWith('loot ')) {
      const itemName = raw.substring(5).trim();
      if (!itemName) return fail(ctx, character, 'Loot what?');

      // Check for quest items at current location
      const questItems = [...ctx.db.quest_item.by_location.filter(character.locationId)]
        .filter((qi: any) => qi.characterId === character.id && qi.discovered && !qi.looted);
      const match = questItems.find((qi: any) => qi.name.toLowerCase() === itemName.toLowerCase()
        || qi.name.toLowerCase().includes(itemName.toLowerCase()));
      if (match) {
        // Mark as looted (same logic as loot_quest_item reducer)
        ctx.db.quest_item.id.update({ ...match, looted: true });

        // Find and complete matching quest
        for (const qi of ctx.db.quest_instance.by_character.filter(character.id)) {
          if (qi.completed) continue;
          if (qi.questTemplateId === match.questTemplateId) {
            ctx.db.quest_instance.id.update({ ...qi, progress: 1n, completed: true });
            const qt = ctx.db.quest_template.id.find(qi.questTemplateId);
            if (qt) {
              const npc = ctx.db.npc.id.find(qt.npcId);
              const giver = npc ? npc.name : 'the quest giver';
              appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
                `Quest complete: ${qt.name}. Return to ${giver}.`);
            }
            break;
          }
        }
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest', `You found ${match.name}!`);
        return;
      }
      // Fall through to other loot handling or fail
      return fail(ctx, character, `Nothing called "${itemName}" to loot here.`);
    }
    ```

    **Important:** Place the "loot <name>" handler AFTER the bare "loot" check (which is `lower === 'loot'`) so bare "loot" still shows the loot list.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vitest run spacetimedb/src/reducers/intent.test.ts</automated>
  </verify>
  <done>
    - "quests" typed in narrative console shows active quest list with progress, giver, description, and [Abandon]/[Turn In] clickable links
    - "turn in <name>" completes a quest at the NPC's location
    - "abandon <name>" removes a quest with affinity penalty
    - Traveling via intent handler spawns resource nodes and enemy spawns (calls ensureSpawnsForLocation + performPassiveSearch before auto-look)
    - LOOK output includes discovered quest items with [Loot <name>] links
    - "loot <name>" handles quest item looting from narrative input
    - All existing tests still pass
  </done>
</task>

</tasks>

<verification>
- `cd C:/projects/uwr && npx vitest run spacetimedb/src/reducers/intent.test.ts` passes
- Publish locally: `spacetime publish uwr -p spacetimedb`
- Travel to a non-safe location and verify LOOK shows resources
- Type "quests" to see active quest list
</verification>

<success_criteria>
- Quest viewing works narratively via "quests" command with clickable actions
- Resource nodes appear in LOOK after traveling via intent handler
- Quest items shown in LOOK output
- All tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/363-quest-management-and-viewing-narratively/363-SUMMARY.md`
</output>
