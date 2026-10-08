<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import {
  PhCastleTurret,
  PhChatCircle,
  PhChatCircleDots,
  PhCircleDashed,
  PhCube,
  PhEye,
  PhSkull,
  PhStorefront,
  PhSword,
  PhUser,
  PhUserCircle,
} from '@phosphor-icons/vue';
import type { Component } from 'vue';
import {
  CONSOLE_KEY,
  FRAME_KEY,
  GAME_KEY,
  createInertConsole,
  createInertFrame,
  createInertGame,
} from '../game/context';
import { createActionRunner, reportRejections } from '../ledger/actionRunner';
import { keepFocus } from '../ledger/keepFocus';
import { enemyRows } from './enemies';
import type { EnemyRow } from './enemies';
import { nearbyRows } from './nearby';
import type { NearbyKind, NearbyRow } from './nearby';
import CharacterName from '../social/CharacterName.vue';
import PlayerMenu from '../social/PlayerMenu.vue';

// Nearby rows with one-click actions (47-UI-SPEC "Nearby", CON-04, CON-02; 51-UI-SPEC "Rail Row
// Additions"). Names are server or player text, rendered as text nodes only. No table lists
// examinable objects at a location (research Q3, UI-SPEC A7), so `objects` stays empty.
// Nearby leads with enemies (quick-261006-a0i): they are the actionable threat. An available
// enemy has one Pull icon button (a careful pull), disabled in a fight, offline and until its
// level is known. Every row ends its action cluster with an Examine eye that sits beside the
// row's main part, never inside it. NPC rows talk through a chat bubble button; a bind stone row
// offers Bind (bind_location) and turns to 'Bound here' only when the character row says so.
// A player row (51.1) lists only online characters and ends Whisper, Examine and the role-aware
// menu (PlayerMenu, opening to the left in the rail); right-click opens that menu on desktop.
// Invite lives in the menu now. Talk to uses the plain chat circle so Whisper keeps its own icon.
const game = inject(GAME_KEY, createInertGame());
const consoleApi = inject(CONSOLE_KEY, createInertConsole());
const frame = inject(FRAME_KEY, createInertFrame());

const connected = computed(() => game.connected.value);

const runner = createActionRunner({ online: connected });

// A rejected Bind (the transport failed, or the reducer threw a SenderError) prints the client
// rejection line in the feed, where the rail's other results go (UI-SPEC copy: "Couldn't send that.
// Try again."). Server refusals made with fail() arrive as their own feed lines.
reportRejections(runner, game.feed);

// The current place: the bind stone row shows only where the place has one.
const place = computed(() => {
  const character = game.character.value;
  if (character === null) return null;
  return game.locations.value.find((location) => location.id === character.locationId) ?? null;
});

const boundHere = computed(() => {
  const character = game.character.value;
  return character !== null && character.boundLocationId === character.locationId;
});

// Everyone in your group (the server's member rows), for the 'In your party' hint.
const partyIds = computed(() => new Set(game.groupMembers.value.map((member) => member.characterId)));

const rows = computed(() =>
  nearbyRows({
    npcs: game.npcsHere.value,
    nodes: game.nodesHere.value,
    players: game.playersHere.value,
    partyIds: partyIds.value,
    objects: [],
    selfId: game.characterId.value,
    bindStone: place.value?.bindStone
      ? { placeName: place.value.name, bound: boundHere.value }
      : null,
  }),
);

const enemies = computed(() =>
  enemyRows({
    spawns: game.enemiesHere.value,
    templates: game.enemyTemplatesHere.value,
    playerLevel: game.character.value?.level ?? null,
  }),
);

const inFight = computed(() => game.combat.active.value);

// Pull stays aria-disabled while the spawn's template level is unknown (the chained template
// subscription is still loading), so the player never pulls blind (review WR-02).
function pullBlocked(row: EnemyRow): boolean {
  return !connected.value || inFight.value || !row.levelKnown;
}

function pullDisabledFor(row: EnemyRow): 'true' | undefined {
  return pullBlocked(row) ? 'true' : undefined;
}

// One Pull button: a careful pull, the same as the feed keyword click (owner decision).
function pull(row: EnemyRow): void {
  if (pullBlocked(row)) return;
  consoleApi.pull({ id: row.id, name: row.name }, 'careful');
}

const ICONS: Record<NearbyKind, Component> = {
  npc: PhUser,
  bindStone: PhCastleTurret,
  object: PhCircleDashed,
  node: PhCube,
  player: PhUserCircle,
};

function rowKey(row: NearbyRow): string {
  return `${row.kind}-${row.id}`;
}

// Only a gatherable node keeps a main-row click; every other row is static.
function hasAction(row: NearbyRow): boolean {
  return row.kind === 'node' && row.nodeStatus === 'gather';
}

function act(row: NearbyRow): void {
  if (!connected.value) return;
  if (row.kind === 'node') consoleApi.gather({ id: row.id, name: row.name });
}

// The eye's target: the bind stone is looked at as 'bind stone' (the server's look category).
function examineName(row: NearbyRow): string {
  return row.kind === 'bindStone' ? 'bind stone' : row.name;
}

function examine(name: string): void {
  if (!connected.value) return;
  consoleApi.examine(name);
}

function talk(row: NearbyRow): void {
  if (!connected.value) return;
  consoleApi.hail({ id: row.id, name: row.name });
}

// Trade opens the vendor screen for the chosen NPC (Phase 50, CONTEXT). The NPC rides in the
// screen arguments through the frame, so ConsoleApi.trade (no NPC) is no longer used here. It does
// not close first: openScreen already replaces the open screen, and a close would schedule a focus
// return that runs after the new drawer or sheet has focused its close button.
function trade(row: NearbyRow): void {
  if (!connected.value) return;
  frame.openScreen('vendor', { npcId: row.id, npcName: row.name });
}

function whisper(row: NearbyRow): void {
  if (!connected.value) return;
  consoleApi.whisperTo(row.name);
}

// One PlayerMenu per player row: the row's right-click opens it, and when its opener goes away
// while focused (the player leaves) focus returns to the Nearby heading.
const heading = ref<HTMLElement | null>(null);
const menus = new Map<bigint, { open: (focus?: 'first' | 'last') => void }>();

function setMenu(id: bigint, instance: Element | ComponentPublicInstance | null): void {
  if (instance === null) menus.delete(id);
  else menus.set(id, instance as unknown as { open: (focus?: 'first' | 'last') => void });
}

function headingFocus(): HTMLElement | null {
  return heading.value;
}

// Desktop only: on mobile the browser's own long-press menu is left alone and the ⋯ is the way in.
function onContextMenu(event: MouseEvent, row: NearbyRow): void {
  if (row.kind !== 'player' || !frame.isDesktop.value) return;
  event.preventDefault();
  menus.get(row.id)?.open('first');
}

const disabledAttr = computed(() => (connected.value ? undefined : 'true'));

const list = ref<HTMLElement | null>(null);

// Focus after a row goes (51.1 review client-rest WR-03, the shared keepFocus rule): players drop
// out when they log out or walk away, enemies when they die or leave, and a row's controls change
// with its state. Focus held on a removed control moves to the first button of the row now at that
// index (the next row, or the same row when only a control went), else the Nearby heading.
keepFocus<number>({
  source: () =>
    [
      ...enemies.value.map((enemy) => `enemy-${enemy.id}-${enemy.status}`),
      ...rows.value.map((row) => `${rowKey(row)}-${row.nodeStatus ?? ''}-${row.bound ? 1 : 0}`),
    ].join(','),
  area: () => list.value,
  capture: (active, area) => {
    const item = active.closest('li');
    return item === null ? -1 : Array.from(area.children).indexOf(item);
  },
  restore: (index) => {
    const items = list.value === null ? [] : Array.from(list.value.children).slice(Math.max(index, 0));
    const next = items.map((item) => item.querySelector<HTMLElement>('button')).find((b) => b !== null);
    return next ?? heading.value;
  },
});

// The place a Bind was sent for (bind_location binds wherever the character stands when it runs).
// Focus moves to the bind stone's eye only when the character row says bound to that place while the
// character still stands there, in either order with the promise. The mark is dropped on a move, a
// rejection, or a short while after the call resolved without the row changing (a fail() refusal
// resolves too), so it can never fire later for another visit (review WR-02).
const BIND_FOCUS_MS = 2000;
let bindTarget: bigint | null = null;
let bindLapse: ReturnType<typeof setTimeout> | null = null;

function clearBindTarget(): void {
  bindTarget = null;
  if (bindLapse !== null) clearTimeout(bindLapse);
  bindLapse = null;
}

function focusBindEye(): void {
  const character = game.character.value;
  if (bindTarget === null || character === null) return;
  if (character.locationId !== bindTarget || character.boundLocationId !== bindTarget) return;
  clearBindTarget();
  void nextTick(() => {
    list.value?.querySelector<HTMLElement>('.kind-bindStone .btn-eye')?.focus();
  });
}

watch(boundHere, focusBindEye);
watch(
  () => game.character.value?.locationId,
  (next) => {
    if (bindTarget !== null && next !== bindTarget) clearBindTarget();
  },
);
onBeforeUnmount(clearBindTarget);

// The server's bind_location refuses in combat with this line (the same as the typed bind intent);
// the button predicts it so a fight that starts before the rail swaps to the encounter cannot bind.
const BIND_IN_COMBAT = 'You cannot bind while in combat.';
const BIND_TITLE = 'Respawn here after defeat';

const bindBlocked = computed(
  () => !connected.value || game.reducers.value === null || inFight.value || runner.isPending('bind'),
);
const bindTitle = computed(() => (inFight.value ? BIND_IN_COMBAT : BIND_TITLE));
const bindReasonId = `${useId()}-bind-reason`;

// Bind is inert until the promise settles and nothing changes optimistically: the row turns to
// 'Bound here' only when the character row changes. Refusals and the server's line print in the feed,
// and so does the send error of a rejected call (watch above).
async function bind(): Promise<void> {
  const characterId = game.characterId.value;
  const reducers = game.reducers.value;
  const target = game.character.value?.locationId ?? null;
  if (!connected.value || reducers === null || characterId === null || target === null) return;
  if (inFight.value || runner.isPending('bind')) return;
  clearBindTarget();
  bindTarget = target;
  const ok = await runner.run('bind', () => reducers.bindLocation({ characterId }));
  if (bindTarget !== target) return;
  if (!ok) {
    clearBindTarget();
    return;
  }
  focusBindEye();
  if (bindTarget === target) bindLapse = setTimeout(clearBindTarget, BIND_FOCUS_MS);
}
</script>

<template>
  <section>
    <h6 ref="heading" tabindex="-1">Nearby</h6>
    <p v-if="rows.length === 0 && enemies.length === 0" class="empty">No one is nearby.</p>
    <ul v-else ref="list" class="rows">
      <li
        v-for="enemy in enemies"
        :key="`enemy-${enemy.id}`"
        class="nearby-row kind-enemy"
        :class="{ 'in-combat': enemy.status === 'inCombat' }"
      >
        <div class="row-main static">
          <PhSkull class="row-icon" :class="enemy.con?.className" :size="14" aria-hidden="true" />
          <span class="row-name" :class="enemy.con?.className" :title="enemy.title">{{ enemy.name }}</span>
          <span class="row-hint">{{ enemy.hint }}</span>
        </div>
        <div class="row-actions">
          <button
            v-if="enemy.status === 'available'"
            type="button"
            class="btn btn-ghost btn-icon"
            :aria-label="enemy.pullLabel"
            :title="enemy.pullLabel"
            :aria-disabled="pullDisabledFor(enemy)"
            @click="pull(enemy)"
          >
            <PhSword :size="16" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-icon btn-eye"
            :aria-label="`Examine ${enemy.name}`"
            :title="`Examine ${enemy.name}`"
            :aria-disabled="disabledAttr"
            @click="examine(enemy.name)"
          >
            <PhEye :size="16" aria-hidden="true" />
          </button>
        </div>
      </li>
      <li
        v-for="row in rows"
        :key="rowKey(row)"
        class="nearby-row"
        :class="[`kind-${row.kind}`, { depleted: row.nodeStatus === 'depleted', bound: row.bound }]"
        @contextmenu="onContextMenu($event, row)"
      >
        <button
          v-if="hasAction(row)"
          type="button"
          class="row-main"
          :aria-disabled="disabledAttr"
          @click="act(row)"
        >
          <component :is="ICONS[row.kind]" class="row-icon" :size="14" aria-hidden="true" />
          <span class="row-name" :title="row.name">{{ row.name }}</span>
          <span class="row-hint">{{ row.hint }}</span>
        </button>
        <div v-else class="row-main static">
          <component :is="ICONS[row.kind]" class="row-icon" :size="14" aria-hidden="true" />
          <!-- Player names go through the shared CharacterName (51.1 review client-rest IN-01). -->
          <CharacterName v-if="row.kind === 'player'" class="row-name" :name="row.name" />
          <span v-else class="row-name" :title="row.name">{{ row.name }}</span>
          <span class="row-hint">{{ row.hint }}</span>
        </div>

        <div class="row-actions">
          <button
            v-if="row.kind === 'npc'"
            type="button"
            class="btn btn-ghost btn-icon"
            :aria-label="`Talk to ${row.name}`"
            :title="`Talk to ${row.name}`"
            :aria-disabled="disabledAttr"
            @click="talk(row)"
          >
            <PhChatCircle :size="16" aria-hidden="true" />
          </button>
          <button
            v-if="row.kind === 'npc' && row.vendor"
            type="button"
            class="btn btn-ghost btn-icon"
            :aria-label="`Trade with ${row.name}`"
            :title="`Trade with ${row.name}`"
            :aria-disabled="disabledAttr"
            @click="trade(row)"
          >
            <PhStorefront :size="16" aria-hidden="true" />
          </button>
          <button
            v-if="row.kind === 'bindStone' && !row.bound"
            type="button"
            class="btn btn-primary btn-bind"
            :aria-label="`Bind to ${place?.name ?? 'this place'}`"
            :title="bindTitle"
            :aria-disabled="bindBlocked ? 'true' : undefined"
            :aria-describedby="inFight ? bindReasonId : undefined"
            @click="bind()"
          >
            Bind
          </button>
          <span v-if="row.kind === 'bindStone' && !row.bound && inFight" :id="bindReasonId" class="sr-only">{{
            BIND_IN_COMBAT
          }}</span>
          <button
            v-if="row.kind === 'player'"
            type="button"
            class="btn btn-ghost btn-icon"
            :aria-label="`Whisper ${row.name}`"
            :title="`Whisper ${row.name}`"
            :aria-disabled="disabledAttr"
            @click="whisper(row)"
          >
            <PhChatCircleDots :size="16" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-icon btn-eye"
            :aria-label="`Examine ${examineName(row)}`"
            :title="`Examine ${examineName(row)}`"
            :aria-disabled="disabledAttr"
            @click="examine(examineName(row))"
          >
            <PhEye :size="16" aria-hidden="true" />
          </button>
          <PlayerMenu
            v-if="row.kind === 'player'"
            :ref="(instance) => setMenu(row.id, instance)"
            :target-id="row.id"
            side="left"
            :size="frame.isDesktop.value ? 'rail' : 'sheet'"
            :fallback-focus="headingFocus"
          />
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

h6 {
  margin: 0 0 8px;
  color: var(--color-neutral-400);
}

.empty {
  margin: 0;
  font-size: 12px;
  color: var(--color-neutral-500);
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nearby-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  min-width: 0;
}

.nearby-row.depleted,
.nearby-row.in-combat {
  opacity: 0.45;
}

/* The name keeps its width first: the hint shrinks (min-width 0, overflow hidden) before the name does. */
.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  align-self: stretch;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
  text-align: left;
}

button.row-main {
  cursor: pointer;
}

button.row-main:hover {
  background: color-mix(in srgb, var(--color-text) 7%, transparent);
}

button.row-main:active {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}

button.row-main:focus-visible {
  outline-offset: -2px;
}

button.row-main[aria-disabled='true'] {
  opacity: 0.45;
  cursor: not-allowed;
}

.row-icon {
  flex-shrink: 0;
}

.kind-npc .row-icon {
  color: var(--color-line-npc);
}

.kind-bindStone .row-icon {
  color: var(--color-neutral-400);
}

.kind-bindStone.bound .row-icon,
.kind-bindStone.bound .row-hint {
  color: var(--color-accent-300);
}

.kind-object .row-icon {
  color: var(--color-neutral-400);
}

.kind-node .row-icon {
  color: var(--color-stamina);
}

.kind-player .row-icon {
  color: var(--color-line-whisper);
}

.row-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
}

.kind-enemy .con-gray {
  color: var(--color-con-gray);
}

.kind-enemy .con-light-green {
  color: var(--color-con-light-green);
}

.kind-enemy .con-blue {
  color: var(--color-con-blue);
}

.kind-enemy .con-white {
  color: var(--color-con-white);
}

.kind-enemy .con-yellow {
  color: var(--color-con-yellow);
}

.kind-enemy .con-orange {
  color: var(--color-con-orange);
}

.kind-enemy .con-red {
  color: var(--color-con-red);
}

.row-hint {
  flex-shrink: 100;
  min-width: 0;
  overflow: hidden;
  margin-left: auto;
  font-size: 10px;
  color: var(--color-neutral-500);
  white-space: nowrap;
}


/* One flex group of one to three icon buttons: the row's own actions, then the eye (a player row ends with the menu). */
.row-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
}

.nearby-row .btn-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  color: var(--color-neutral-300);
}

.nearby-row .btn-icon[aria-disabled='true'],
.nearby-row .btn-bind[aria-disabled='true'] {
  opacity: 0.45;
  cursor: not-allowed;
}

.nearby-row .btn-bind {
  flex-shrink: 0;
  min-height: 28px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 500;
}

@media (max-width: 899px) {
  .nearby-row {
    min-height: 44px;
  }

  .nearby-row .btn-icon {
    width: 44px;
    height: 44px;
  }

  .nearby-row .btn-bind {
    min-height: 44px;
  }
}
</style>
