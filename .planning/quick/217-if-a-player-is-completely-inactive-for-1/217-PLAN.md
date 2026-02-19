---
phase: quick-217
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/schema/scheduled_tables.ts
  - spacetimedb/src/seeding/ensure_content.ts
  - spacetimedb/src/reducers/movement.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/reducers/commands.ts
  - spacetimedb/src/index.ts
autonomous: true
requirements: [QUICK-217]

must_haves:
  truths:
    - "A player who takes no action for 15 minutes is automatically camped (activeCharacterId cleared)"
    - "Players actively playing are never auto-camped"
    - "Players in combat are not auto-camped even at 15-min mark"
    - "Auto-camp fires a location event: '<Name> heads to camp.' so nearby players see it"
  artifacts:
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "lastActivityAt optional timestamp on Player table; InactivityTick scheduled table"
      contains: "lastActivityAt"
    - path: "spacetimedb/src/seeding/ensure_content.ts"
      provides: "ensureInactivityTickScheduled helper"
      exports: ["ensureInactivityTickScheduled"]
    - path: "spacetimedb/src/index.ts"
      provides: "sweep_inactivity reducer; ensureInactivityTickScheduled called in init + clientConnected"
      contains: "sweep_inactivity"
  key_links:
    - from: "movement/combat/commands reducers"
      to: "player.lastActivityAt"
      via: "ctx.db.player.id.update touch on every meaningful action"
      pattern: "lastActivityAt.*ctx.timestamp"
    - from: "sweep_inactivity"
      to: "clear_active_character logic"
      via: "reusing the same camp logic (leave group, location event, clear activeCharacterId)"
      pattern: "activeCharacterId.*undefined"
---

<objective>
Auto-camp players who have been completely inactive for 15 minutes.

Purpose: Prevent AFK characters from occupying the world indefinitely. Mirrors the existing
`clear_active_character` (manual camp) but fires automatically from a periodic sweep tick.

Output: InactivityTick scheduled table, lastActivityAt tracking on Player, sweep_inactivity
reducer that runs every 5 minutes and auto-camps any active player whose lastActivityAt is
more than 15 minutes ago.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/schema/tables.ts
@spacetimedb/src/schema/scheduled_tables.ts
@spacetimedb/src/seeding/ensure_content.ts
@spacetimedb/src/index.ts
@spacetimedb/src/reducers/characters.ts
@spacetimedb/src/reducers/movement.ts
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/reducers/commands.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add lastActivityAt to Player + InactivityTick scheduled table</name>
  <files>
    spacetimedb/src/schema/tables.ts
    spacetimedb/src/schema/scheduled_tables.ts
    spacetimedb/src/seeding/ensure_content.ts
  </files>
  <action>
**1a. `spacetimedb/src/schema/tables.ts` — add `lastActivityAt` field to `Player` table:**

In the `Player` table column definition (currently ends with `sessionStartedAt`), add:

```typescript
lastActivityAt: t.timestamp().optional(),
```

Add it after `sessionStartedAt`. This is an optional timestamp so existing rows remain valid
(it will be null until the player takes an action).

**1b. `spacetimedb/src/schema/tables.ts` — add `InactivityTick` scheduled table:**

After `CharacterLogoutTick` (around line 1183), add:

```typescript
export const InactivityTick = table(
  {
    name: 'inactivity_tick',
    scheduled: 'sweep_inactivity',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);
```

Then add `InactivityTick` to the schema export at the bottom of the file (inside the
`schema(...)` call, after `EventDespawnTick`):

```typescript
InactivityTick,
```

**1c. `spacetimedb/src/schema/scheduled_tables.ts` — export InactivityTick:**

Add `InactivityTick` to the exports:

```typescript
export { ..., InactivityTick } from './tables';
```

**1d. `spacetimedb/src/seeding/ensure_content.ts` — add ensureInactivityTickScheduled:**

Import `InactivityTick` from `'../schema/scheduled_tables'`.

Add the ensure function (5-minute sweep interval = 300_000_000 microseconds):

```typescript
export function ensureInactivityTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.inactivityTick.iter())) {
    ctx.db.inactivityTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 300_000_000n),
    });
  }
}
```

Export it from `ensure_content.ts`.
  </action>
  <verify>
`spacetime publish uwr --project-path spacetimedb` compiles without errors.
Check that `InactivityTick` appears in the schema export and `Player` table has `lastActivityAt`.
  </verify>
  <done>
Module compiles. Player table has lastActivityAt optional field. InactivityTick table exists
in schema and scheduled_tables exports. ensureInactivityTickScheduled is exported from
ensure_content.ts.
  </done>
</task>

<task type="auto">
  <name>Task 2: Activity tracking on key reducers + sweep_inactivity reducer</name>
  <files>
    spacetimedb/src/reducers/movement.ts
    spacetimedb/src/reducers/combat.ts
    spacetimedb/src/reducers/commands.ts
    spacetimedb/src/index.ts
  </files>
  <action>
**2a. Add `touchPlayerActivity` helper usage — update player.lastActivityAt on actions.**

In each of the following reducers, after `requireCharacterOwnedBy` succeeds, add a player
activity touch. The pattern is the same in all three files:

```typescript
// After requireCharacterOwnedBy or requirePlayerUserId succeeds:
const _player = ctx.db.player.id.find(ctx.sender);
if (_player) {
  ctx.db.player.id.update({ ..._player, lastActivityAt: ctx.timestamp });
}
```

Touch points to add:

- **`spacetimedb/src/reducers/movement.ts`** — `move_character` reducer, after the character
  is fetched (line ~27).

- **`spacetimedb/src/reducers/combat.ts`** — `pull_enemies` reducer (the combat initiation
  action), after `requireCharacterOwnedBy`. Also add to `use_ability` reducer.

- **`spacetimedb/src/reducers/commands.ts`** — `submit_command` and `say` reducers, after
  `requireCharacterOwnedBy`.

This covers the primary activity surfaces: movement, combat, and chat/commands.
Do NOT touch scheduled reducers (regen_health, sweep_inactivity etc.) — those are server-
side ticks, not player actions.

**2b. `spacetimedb/src/index.ts` — add sweep_inactivity reducer + wire up scheduling:**

**Import InactivityTick** at the top with the other scheduled table imports:
```typescript
import { ..., InactivityTick } from './schema/tables';
```
Add `InactivityTick` to the `reducerDeps` object so it's available if needed.

**Import ensureInactivityTickScheduled** from `'./seeding/ensure_content'`.

**Wire scheduling** — call `ensureInactivityTickScheduled(ctx)` in both:
- `spacetimedb.init((ctx) => { ... })`
- `spacetimedb.clientConnected((ctx) => { ... })`

**Add the sweep reducer** after the existing `tick_day_night` reducer:

```typescript
const INACTIVITY_TIMEOUT_MICROS = 900_000_000n; // 15 minutes
const INACTIVITY_SWEEP_INTERVAL_MICROS = 300_000_000n; // 5 minutes

spacetimedb.reducer('sweep_inactivity', { arg: InactivityTick.rowType }, (ctx) => {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const cutoff = now - INACTIVITY_TIMEOUT_MICROS;

  for (const player of ctx.db.player.iter()) {
    // Only check players who have an active character
    if (!player.activeCharacterId || !player.userId) continue;

    // Determine last activity time — prefer lastActivityAt, fall back to lastSeenAt
    const lastActive = player.lastActivityAt ?? player.lastSeenAt;
    if (!lastActive) continue;
    if (lastActive.microsSinceUnixEpoch > cutoff) continue;

    // Player is inactive — auto-camp
    const character = ctx.db.character.id.find(player.activeCharacterId);
    if (character) {
      // Cannot camp during combat
      const inCombat = activeCombatIdForCharacter(ctx, character.id);
      if (inCombat) continue;

      // Announce to location
      appendLocationEvent(ctx, character.locationId, 'system', `${character.name} heads to camp.`, character.id);

      // Leave group if in one (mirrors clear_active_character logic)
      if (character.groupId) {
        const groupId = character.groupId;
        for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
          if (member.characterId === character.id) {
            ctx.db.groupMember.id.delete(member.id);
            break;
          }
        }
        ctx.db.character.id.update({ ...character, groupId: undefined });
        appendGroupEvent(ctx, groupId, character.id, 'group', `${character.name} headed to camp (AFK).`);

        const remaining = [...ctx.db.groupMember.by_group.filter(groupId)];
        if (remaining.length === 0) {
          for (const invite of ctx.db.groupInvite.by_group.filter(groupId)) {
            ctx.db.groupInvite.id.delete(invite.id);
          }
          ctx.db.group.id.delete(groupId);
        } else {
          const group = ctx.db.group.id.find(groupId);
          if (group && group.leaderCharacterId === character.id) {
            const newLeader = ctx.db.character.id.find(remaining[0]!.characterId);
            if (newLeader) {
              ctx.db.group.id.update({
                ...group,
                leaderCharacterId: newLeader.id,
                pullerCharacterId: group.pullerCharacterId === character.id ? newLeader.id : group.pullerCharacterId,
              });
              ctx.db.groupMember.id.update({ ...remaining[0]!, role: 'leader' });
              appendGroupEvent(ctx, groupId, newLeader.id, 'group', `${newLeader.name} is now the group leader.`);
            }
          }
        }
      }

      // Notify player's private event stream
      appendPrivateEvent(ctx, character.id, player.userId, 'system',
        'You have been automatically camped due to inactivity.');
    }

    // Clear active character (the actual camp)
    ctx.db.player.id.update({
      ...player,
      activeCharacterId: undefined,
      lastActivityAt: undefined,
    });
  }

  // Schedule next sweep
  ctx.db.inactivityTick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(now + INACTIVITY_SWEEP_INTERVAL_MICROS),
  });
});
```

Note: `activeCombatIdForCharacter`, `appendLocationEvent`, `appendPrivateEvent`,
`appendGroupEvent` are all imported in `index.ts` already. `GroupMember`, `GroupInvite`,
`Group` references use `ctx.db.groupMember`, `ctx.db.groupInvite`, `ctx.db.group` — all
already available via the existing imports and table registration.
  </action>
  <verify>
`spacetime publish uwr --project-path spacetimedb` compiles and publishes.
`spacetime logs uwr` shows no errors.
Verify InactivityTick row appears in the DB after init (check via `spacetime sql uwr "SELECT * FROM inactivity_tick"`).
  </verify>
  <done>
Module publishes cleanly. inactivity_tick table has 1 scheduled row with next fire ~5 min
from publish. After 15+ minutes AFK with an active character, the player is auto-camped:
activeCharacterId clears, location sees "heads to camp." message. Active players (those who
move, use abilities, or chat) are never auto-camped.
  </done>
</task>

</tasks>

<verification>
1. `spacetime publish uwr --project-path spacetimedb` succeeds with no TypeScript errors
2. `spacetime sql uwr "SELECT * FROM inactivity_tick"` returns one row
3. Manual test: log in, set active character, wait 15+ min without any action → character auto-camps
4. Manual test: log in, move every few minutes → no auto-camp
5. Manual test: enter combat → no auto-camp even if 15 min pass during combat
</verification>

<success_criteria>
- lastActivityAt field exists on Player table
- InactivityTick table exists, one scheduled row fires every 5 minutes
- sweep_inactivity iterates all active players, skips those in combat or active within 15 min
- Inactive players are camped: activeCharacterId cleared, group cleanup runs, location event fires
- Activity touch (lastActivityAt update) happens in move_character, pull_enemies, use_ability, submit_command, say
</success_criteria>

<output>
After completion, create `.planning/quick/217-if-a-player-is-completely-inactive-for-1/217-SUMMARY.md`
</output>
