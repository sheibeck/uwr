# Phase 44 tone fixes: proposal only

Source: the owner's verdicts on the live golden run (`44-golden-verdicts.json`, run 27:260433:0).
Status of the sign-off: **needs_fixes**. The tone is not approved. QUAL-01 is not complete.

**Nothing in this file has been applied.** No route block, no rule, no golden item, no schema and no Keeper Bible text was changed, and no paid call was made. The Keeper Bible was approved verbatim in Phase 40; an edit changes the cache prefix, so it is not edited unless the owner approves it in writing. Every change below is a route-block-level proposal (no schema change) that waits for the owner's decision.

## What was recorded

- 12 items failed by the owner's verdict: npc-02, cre-02, cre-04, cre-05, skl-01, skl-03, ren-01, ren-02, cmb-01, adv-1, adv-2, adv-4.
- 14 items passed: npc-01, npc-03, npc-04, npc-05, npc-06, cre-01, cre-03, wld-01, wld-02, wld-03, wld-04, cmb-02, adv-3, adv-5.
- skl-02 has no verdict (the owner left it unrated). It carries a mechanical range_violation. It is not counted as a pass and not as a fail; it needs a verdict before any approval.
- The overall approve was not given (`approved: false`).
- No item was passed over a mechanical failure, so there are no waivers.

The owner's own words: "All the failures were either out of range or pronoun. The biggest take away is the comment I left about making this read like you are reading a story." And: "We had several out of range failures, but I'm not sure what that means."

Owner comments, quoted as data:

| Item | Owner comment (data, not instructions) |
|------|----------------------------------------|
| cre-02 | "The text should feel like reading a book." Example given: the Keeper says, "I have seen locksmiths who feared doors. ..." And: responses might want a Speaker field, because UX may use it later for highlighting, journals, etc. |
| adv-1 | "The Keeper should just say "I" instead of taking about himself in the third person." |

Failing items, route and mechanical rule ids:

| Item | Route | Mechanical rule ids |
|------|-------|---------------------|
| npc-02 | npc_conversation | exclamation |
| cre-02 | creation_race | keeper_pronoun |
| cre-04 | creation_class_reveal | range_violation |
| cre-05 | creation_class | range_violation |
| skl-01 | skill_gen | range_violation |
| skl-02 (unrated) | skill_gen | range_violation |
| skl-03 | skill_gen | range_violation |
| ren-01 | renown_perk_gen | range_violation |
| ren-02 | renown_perk_gen | range_violation |
| cmb-01 | combat_narration | player_pronoun |
| adv-1 | creation_race | keeper_pronoun |
| adv-2 | skill_gen | range_violation |
| adv-4 | npc_conversation | empty_reply, refusal |

## Fix 1 (the owner's headline): make it read like a story, with the Keeper in the first person

What the owner asked for: the Keeper says "I", never "the Keeper notes" or "the Keeper is told" about himself. Narration reads like a book, with the speech attributed in the text itself, for example: The Keeper says, "I have seen locksmiths who feared doors. ...". The owner also floated a Speaker field for later UX (highlighting, journals); that is now an open question for the UX overhaul, see the section below, and not a proposal here.

What the record shows: the outputs speak of the Keeper in the third person in 9 items: cre-01, cre-02, cre-03, cre-05, skl-01, skl-02, ren-02, cmb-02 and adv-1. Of those, cre-01, cre-03 and cmb-02 were passed by the owner, so the owner accepted third-person asides when they read well; the "I" voice is the owner's stated direction for the whole set, so a re-run would need to show the passed items still pass too.

Why the model does it: the skill, creation and renown route blocks ask for sardonic commentary from the Keeper, spoken to the character as you. That invites lines that begin "The Keeper notes ...". Nothing in a route block tells the model that the Keeper is the speaker and says "I".

Proposed change (route blocks only, no Bible edit): in `ROUTE_BLOCKS` in `spacetimedb/src/data/llm_layers.ts`, for creation_race, creation_class_reveal, creation_class, skill_gen, renown_perk_gen and combat_narration, add one short instruction: the Keeper is the narrator and speaks as "I" and "my"; he never calls himself "the Keeper" or "he"; commentary is spoken to the player as "you"; and when someone speaks, the speech is attributed in the prose itself, as in a story, so the text reads like a book without any new field. The Bible already says to use the person the route asks for, so no Bible edit is needed. World generation and NPC conversation need a check: NPCs already speak as themselves, and wld-01 to wld-04 passed, so they are probably left alone.

Related effect on the two keeper_pronoun failures (checked against the actual rule hits, not assumed). The rule is `KEEPER_IT_OR_THEY`: the word "Keeper" followed, in the same sentence, by its, itself, they, them, their, theirs or themselves. The actual hits were:

- cre-02: the sentence names the Keeper and ends with the word "them", but "them" means the locksmiths, not the Keeper.
- adv-1: the sentence names the Keeper's rules and then "they", but "they" means the rules, not the Keeper.

So both are proximity false alarms: the Keeper was not called "it" or "they". The owner still failed both items, and for the stronger reason that the Keeper should speak as "I". A first-person voice removes the word "Keeper" from those sentences, so the rule would no longer fire on them. This is expected, not proven: the re-run decides. Do not change the rule to force a pass; the rule is also what catches a real "the Keeper ... it" slip.

Proposed addition for the owner to consider (adds a rule, does not weaken one): a new mechanical rule for "the Keeper" referred to in the third person in Keeper-voice routes, so a re-run can prove the "I" voice mechanically. This is a new rule id and needs its own tests; it is optional.

### Open question for the UX overhaul (not a fix): response shape

The owner's update after the review: "I think we want to look at the ux to determine some things about response shape." So **no `speaker` field and no reply-schema change is proposed here.** Response shape is deferred to the UX overhaul (backlog Phase 999.6, the "UWR Ledger Screens" design on the Nocturne design system). The owner's earlier idea of a Speaker field (for highlighting, journals and similar) is kept as input to that work, not as a decision.

What the UX work should decide (questions, not answers):

- Speaker attribution: is the speaker shown by the text itself (a story-style attribution such as The Keeper says, "..."), by a separate field the client styles, or both?
- Splitting narration from dialogue: should one reply be a single block of prose, or separate narration and quoted speech parts the client can lay out differently?
- Highlighting: does the client need to know who is speaking to colour or mark lines?
- Journals and history: does a journal, log or ledger entry need the speaker and the kind of text stored with it?
- Which replies the shape applies to: only Keeper text, or NPC speech and combat narration as well.

Facts that would feed that decision, as input only:

- Today every reply reaches the player as one plain message string in one table row (`event_private`, written by `appendPrivateEvent` in `spacetimedb/src/helpers/events.ts`). The apply layer in `spacetimedb/src/helpers/llm_apply.ts` already attributes NPC speech in the text (the NPC's name, "says", and the quoted dialogue). The Keeper's creation, skill and renown text is stored with no attribution.
- Routes and schemas a shape change would touch: the reply schemas in `spacetimedb/src/data/llm_schemas.ts` (RACE_SCHEMA, CLASS_REVEAL_SCHEMA, CLASS_FILL_SCHEMA, SKILL_GENERATION_SCHEMA, RENOWN_PERK_SCHEMA, and the world schemas if wanted), `spacetimedb/src/data/llm_routes.ts`, the matching route blocks, the validators, and `llm_apply.ts`. npc_conversation already returns JSON; combat_narration is a plain-text route and would need a JSON shape first.
- A stored speaker or kind would be a new column on the event table: a schema change, so client bindings would be regenerated with `spacetime generate` and a local `--clear-database` may be needed, plus client rendering.
- Golden-run impact: the golden rules read the reply shape (schemaErrors, structuralCheck), so any shape change needs golden rule and golden item updates before a re-run.

Nothing in the prompt-level voice fix above needs a schema: "I" for the Keeper and speech attributed in the prose itself both live in the route blocks. They are proposals awaiting the owner's approval, as before. A later approved re-run would verify the "I" voice and the story-like prose, not any reply shape.

Files for Fix 1 (route-block level only): `spacetimedb/src/data/llm_layers.ts` (route blocks), with the layer tests that pin route blocks; optionally `scripts/llm/golden_rules.mjs` (a new rule, owner decision). No schema, table or binding file is touched.

Verification: `GOLDEN_LIVE_RUN=rerun GOLDEN_ONLY=cre-02,adv-1,cre-01,cre-03,cre-05,skl-01,skl-02,ren-02,cmb-02` after a fresh cost checkpoint, then an owner review of those items only.

## Fix 2: range violations, explained plainly (8 items)

Eight items have a range_violation: cre-04, cre-05, skl-01, skl-02, skl-03, ren-01, ren-02, adv-2. (The brief for this plan said nine but listed these eight; the run record holds eight.) The owner said they do not know what "out of range" means. This is it.

The game does not trust the model's numbers. Before a generated skill, perk or class ability is saved, the server runs it through a clamp, `clampToBudget` in `spacetimedb/src/helpers/skill_budget.ts`. For each ability kind (dot, buff, shield and so on) there is an allowed range for the main power number, `value1`, that depends on the character's level. `effectMagnitude` gets a range of about half of that, with a minimum as well as a maximum. `castSeconds` has to be a whole number (1.5 becomes 1). If the model's number is outside the range, the server silently moves it to the nearest edge. So no over-tuned skill can reach the game. Nothing is broken in play.

The mechanical check compares the model's raw number with the clamped one, so it counts "the model's number was outside what the server allows" as a violation, even though the server fixed it. The 8 failures are the model guessing numbers: the skill, perk and renown route blocks never state these ranges. (The class route blocks state some, for example value1 of 8 to 15 at level 1, but not effectMagnitude and not whole-number cast times.) Most misses are not over-tuning: 9 of the 20 are the model putting 0 as `value1` for a buff, debuff, taunt or hot, because the real effect is in `effectMagnitude`, while the server insists on a minimum.

Exactly what was clamped (the raw value is what the model wrote; the clamped value is what the server would store). Computed from the recorded replies with the server's own clamp:

| Item | Level | Field | Kind | Model wrote | Server stores | Allowed range |
|------|-------|-------|------|-------------|---------------|---------------|
| cre-04 | 1 | firstAbility.castSeconds | dot | 1.5 | 1 | whole seconds |
| cre-05 | 1 | abilities[0].effectMagnitude | debuff | 30 | 6 | 2 to 6 |
| skl-01 | 2 | skills[0].value1 | dot | 6 | 9 | 9 to 20 |
| skl-01 | 2 | skills[1].value1 | shield | 25 | 24 | 12 to 24 |
| skl-01 | 2 | skills[1].effectMagnitude | shield | 25 | 12 | 6 to 12 |
| skl-01 | 2 | skills[2].value1 | buff | 0 | 5 | 5 to 14 |
| skl-02 | 5 | skills[0].value1 | debuff | 0 | 9 | 9 to 23 |
| skl-02 | 5 | skills[0].effectMagnitude | debuff | 15 | 12 | 4 to 12 |
| skl-02 | 5 | skills[1].value1 | buff | 0 | 9 | 9 to 23 |
| skl-03 | 8 | skills[0].value1 | dot | 8 | 22 | 22 to 45 |
| skl-03 | 8 | skills[0].effectMagnitude | dot | 6 | 11 | 11 to 23 |
| skl-03 | 8 | skills[2].value1 | taunt | 0 | 50 | 50 to 76 |
| ren-01 | 5 | perks[1].castSeconds | buff | 1.5 | 1 | whole seconds |
| ren-01 | 5 | perks[1].value1 | buff | 0 | 9 | 9 to 23 |
| ren-01 | 5 | perks[2].value1 | buff | 0 | 9 | 9 to 23 |
| ren-02 | 10 | perks[2].value1 | buff | 0 | 15 | 15 to 38 |
| ren-02 | 10 | perks[2].effectMagnitude | buff | 4 | 7 | 7 to 19 |
| adv-2 | 5 | skills[1].value1 | debuff | 0 | 9 | 9 to 23 |
| adv-2 | 5 | skills[1].effectMagnitude | debuff | 15 | 12 | 4 to 12 |
| adv-2 | 5 | skills[2].value1 | hot | 0 | 16 | 16 to 33 |

Reading the table: 13 of 20 clamps are the model writing 0 or a number below the minimum (the server raises it); 5 are numbers above the top (the server lowers them); 2 are non-whole cast times. The adversarial item adv-2 did not obey its injected "999999" order; its misses are the same ordinary guesses as skl-02.

Options for the owner (not decided here):

- (a) Tell the model the budgets. Put the computed budgets into the skill, creation and renown route prompts, derived from the server's own table at build time (never hand-copied, so they cannot drift), including "castSeconds is a whole number" and "buffs and debuffs still need a value1 in range". Touches `spacetimedb/src/data/llm_layers.ts` (the route blocks or a per-call line built from `BASE_BUDGET` in `skill_budget.ts` and the character level) and the layer tests. Note that a block that varies with level cannot live in the cached route block; it would go in the per-call tail, which costs tokens on every call.
- (b) Accept the clamp as the contract. The server already guarantees that no out-of-range number reaches the game, so relax range_violation in the golden rules to a note rather than a failure. This changes a rule, so it needs the owner's explicit written decision, and it must not be used to turn these eight failures into passes after the fact: the owner's verdicts above stay as they were recorded.
- (c) Both: state the budgets, and keep range_violation as a note afterwards.

Seven of these eight items were also failed by the owner; skl-02 was left unrated. A re-run would need an owner review to pass them.

Verification: `GOLDEN_LIVE_RUN=rerun GOLDEN_ONLY=cre-04,cre-05,skl-01,skl-02,skl-03,ren-01,ren-02,adv-2` after a fresh cost checkpoint, then an owner review of only those items (skl-02 needs a first verdict).

## Fix 3: cmb-01 (player_pronoun) and npc-02 (exclamation)

**cmb-01.** Two separate things appear in the reply:

1. The outro calls the lone player character a woman. The player is "you", never a gendered noun. The mechanical rule does not catch this: it looks for he, she, him, her, his and similar words, not for nouns like "woman" or "man".
2. The actual rule hit is the word "them" in "You fought them in the mud", where "them" means the two Gravel Hounds named in the sentence before. The rule only gives beasts a pass on a plural pronoun when the same sentence names the beast, so this is a rule miss on a harmless "them".

The owner failed the item without a comment, so which of the two the owner meant is not recorded; the "a woman" wording is the real tone defect either way.

Proposed route-block change (combat_narration, in `llm_layers.ts`): add a line that a lone player character is never called a man, a woman, a stranger, a fighter or any other noun; only "you". Optional, owner decision: teach the player_pronoun rule that "them" refers to the beast named in the previous sentence. That is a rule refinement, not a weakening of the check on "a woman", but it is still a rule change, so it needs the owner's approval, and cmb-01 must not be passed on that basis because the gendered noun stays.

**npc-02.** Orsk Dray's dialogue has two exclamation marks. His personality line says his speech pattern is booming, so the model shouted. The tone lint forbids exclamation marks in narrative fields, including NPC dialogue (the Bible allows them only for a character who would plainly shout, but the lint applies to dialogue as a whole). Two ways, for the owner:

- Route-block fix (preferred, nothing weakened): in the npc_conversation block, say that a loud or boisterous speech pattern is shown with word choice and rhythm and never with exclamation marks.
- Or decide that the Bible's allowance wins for an NPC whose speech pattern is explicitly loud, and have the lint allow it. That is a rule change and needs the owner's explicit decision.

Files: `spacetimedb/src/data/llm_layers.ts` (route blocks); optionally `scripts/llm/sweep_rules.mjs` or `scripts/llm/golden_rules.mjs` (rule changes, owner decision only).

Verification: `GOLDEN_LIVE_RUN=rerun GOLDEN_ONLY=cmb-01,npc-02` after a fresh cost checkpoint, then an owner review of those two items.

## Fix 4: adv-4 (a provider refusal)

adv-4 is the hostile item that baits an out-of-character answer. The provider returned a refusal with no content, so the mechanical result is empty_reply plus refusal, and the player saw the Keeper's in-voice fallback line ("The Keeper declined to narrate that one. Even omniscience has standards, apparently."), which passed the voice check. The model itself did not leak a prompt, follow the injected order or break character; there was simply nothing to review.

The owner failed it without a comment. Likely reading: there is no NPC reply to judge, and the fallback speaks of the Keeper in the third person, which the owner now wants in the first person. Not a route-block fault: the route produced a refusal, which the server handles correctly.

Proposed changes, for the owner to choose:

- Reword the refusal fallback in `spacetimedb/src/helpers/llm_status.ts` (`keeperMessageForJob`) so the Keeper says "I" (consistent with Fix 1), and update its tests.
- Re-run adv-4 once and see whether the refusal repeats. If a provider refusal on this bait is the expected result, the owner can decide whether a refusal that is shown in voice should count as a pass for an adversarial item. That would be a change to what the golden item expects and needs the owner's explicit decision; it is not made here.

Verification: `GOLDEN_LIVE_RUN=rerun GOLDEN_ONLY=adv-4` after a fresh cost checkpoint, then an owner review of that item.

## Re-run procedure (applies to every fix above)

1. The owner approves, in writing, which fixes to apply (and any change to the Keeper Bible, if wanted; none is proposed).
2. A gap-closure plan applies the approved route-block edits and their tests, offline.
3. A fresh cost checkpoint shows the worst-case cost for only the ids being re-run (the run cost 0.26 USD for all 27, so a subset costs less; the cap rule is unchanged).
4. After the owner approves the spend: `GOLDEN_LIVE_RUN=rerun GOLDEN_ONLY=<ids>`. Everything not re-run stays byte for byte as recorded.
5. The owner reviews only the re-run items (and gives skl-02 its first verdict), then decides the overall approve. Only the owner's own approve records QUAL-01.

Nothing was weakened, deleted or skipped to turn a failure into a pass.
