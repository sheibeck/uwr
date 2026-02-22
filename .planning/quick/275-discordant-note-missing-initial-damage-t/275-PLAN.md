---
phase: quick-275
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
autonomous: true
requirements:
  - QUICK-275
must_haves:
  truths:
    - "Casting Discordant Note immediately deals damage to all living combat enemies"
    - "The initial damage amount equals the regular 6s tick (8 + level*2 + cha)"
    - "The initial tick drains 3 mana from the bard, same as a regular tick"
    - "The regular 6s tick loop continues to fire every 6s after the initial tick"
    - "Battle Hymn burst behaviour is unchanged"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "Initial damage tick on Discordant Note cast"
      contains: "bard_discordant_note"
  key_links:
    - from: "bard_discordant_note case in executeAbilityAction"
      to: "combatEnemy rows"
      via: "direct HP mutation on cast"
      pattern: "ctx\\.db\\.combatEnemy\\.id\\.update"
---

<objective>
Restore the first-tick damage for Discordant Note that was removed in quick-271.

The previous fix went too far — it stripped the initial damage completely. The correct
behaviour is: on cast, deal one tick of Discordant Note damage (identical formula to the
6s scheduled tick), then let the tick loop run normally from there.

Purpose: Players should feel the "snap" of the first hit when they cast Discordant Note.
Output: Modified `combat.ts` where the `bard_discordant_note` case fires an immediate
        damage tick on cast.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md

@spacetimedb/src/helpers/combat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add initial damage tick to Discordant Note cast</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
    In the `bard_discordant_note` / bard song block of `executeAbilityAction` (around line 1011),
    the comment currently reads:
      "Damage songs deal an immediate burst on cast (discordant_note excluded — too powerful)"
    and only fires the burst for `bard_battle_hymn`.

    Change this so `bard_discordant_note` ALSO fires an immediate first tick using the EXACT
    same formula as the `tick_bard_songs` reducer case for `bard_discordant_note`:

      const dmg = 8n + character.level * 2n + character.cha;
      const actualDmg = en.currentHp > dmg ? dmg : en.currentHp;
      const nextHp = en.currentHp > dmg ? en.currentHp - dmg : 0n;
      ctx.db.combatEnemy.id.update({ ...en, currentHp: nextHp });

    Also drain 3 mana from the bard immediately (same as regular tick):
      const freshBard = ctx.db.character.id.find(character.id);
      if (freshBard && freshBard.mana > 0n) {
        const manaCost = 3n;
        const newMana = freshBard.mana > manaCost ? freshBard.mana - manaCost : 0n;
        ctx.db.character.id.update({ ...freshBard, mana: newMana });
      }

    Log total damage dealt using `appendPrivateEvent` (or equivalent logging used elsewhere
    in the block) — e.g.:
      `Discordant Note deals ${totalDamage} damage to all enemies.`

    Keep the `activeEnemies` variable already used for the Battle Hymn burst, or derive
    `activeEnemies` for Discordant Note as:
      [...ctx.db.combatEnemy.by_combat.filter(combatId)].filter((e: any) => e.currentHp > 0n)

    Update the comment to reflect that both songs now fire an initial tick (Battle Hymn
    fires its larger burst, Discordant Note fires a normal-sized tick).

    Do NOT change the tick loop scheduling — the 6s interval scheduled at `nowMicros + 6_000_000n`
    is already correct and must remain untouched.

    Do NOT change the Battle Hymn burst formula (`8n + character.level * 2n + character.cha`
    — this happens to be the same formula; the difference is that Battle Hymn's burst was
    always intentional whereas Discordant Note's was removed).
  </action>
  <verify>
    Publish to local:
      spacetime publish uwr --project-path C:/projects/uwr/spacetimedb

    In-game test:
    1. Enter combat with at least one living enemy.
    2. Cast Discordant Note.
    3. Confirm damage is dealt to enemies immediately on cast (event log shows
       "Discordant Note deals X damage to all enemies." at the moment of cast).
    4. Wait 6 seconds — confirm the regular tick fires again with the same message.
    5. Confirm mana decreases by 3 on cast and by 3 again on each subsequent tick.
  </verify>
  <done>
    Casting Discordant Note in combat immediately deals one tick of damage (formula:
    8 + level*2 + cha) to all living enemies and drains 3 mana, matching the behaviour
    of subsequent 6s ticks. The tick loop continues normally every 6s after the initial hit.
  </done>
</task>

</tasks>

<verification>
- `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` succeeds with no errors.
- Discordant Note event log shows damage message at cast time AND at each 6s tick.
- No regression on Battle Hymn burst (still fires its separate larger burst on cast).
- No regression on non-combat songs (Melody of Mending, Chorus of Vigor, March of Wayfarers).
</verification>

<success_criteria>
Discordant Note deals one full tick of damage immediately on cast. The 6s tick loop
continues from there. Behaviour matches the regular tick in formula and mana cost.
No other bard songs are affected.
</success_criteria>

<output>
After completion, create `.planning/quick/275-discordant-note-missing-initial-damage-t/275-01-SUMMARY.md`
</output>
