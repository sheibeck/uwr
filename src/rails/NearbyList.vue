<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import {
  PhCastleTurret,
  PhChatCircle,
  PhChatCircleDots,
  PhCircleDashed,
  PhEye,
  PhStorefront,
  PhUser,
  PhUserCircle,
} from '@phosphor-icons/vue';
import type { Component } from 'vue';
import { placeNounFor } from '@game-data/density_lines';
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
import { nearbyRows } from './nearby';
import type { NearbyKind, NearbyRow } from './nearby';
import CharacterName from '../social/CharacterName.vue';
import PlayerMenu from '../social/PlayerMenu.vue';
import PoolCard from './PoolCard.vue';
import { GATHER_BUSY_REASON, NEARBY_COPY, familyRows, namedRows, nearbyGroups, resourceRows } from './pools';
import type { FamilyRow, NamedPlace, NamedRow, QuestTargetLike, ResourceRow } from './pools';
import { placeTargetLevel } from './levelRange';

// Nearby (47-UI-SPEC "Nearby", CON-04; 51-UI-SPEC "Rail Row Additions"; rebuilt around the density
// pools in 51.3.1.1-19, UI-SPEC "Nearby" sections and UI Considerations Q1-Q3). Groups, in order:
// - Creatures: one PoolCard per creature family here (never an individual ordinary enemy, D-01,
//   D-03), danger first, wiped-out families last with their line and no button (D-30). Pull draws a
//   group sized by the density; there is no careful single pull any more (D-12). Omitted at a safe
//   or uncharted place; 'Nothing hunts here now.' at any other place with no family pools.
// - Named & quest targets: the character's own named enemies here and the World event spawns here,
//   each with Fight (D-07, D-39); a slain one reads 'Slain · back after a long rest' with no button.
// - Resources: one card per resource pool of this time of day (D-26, D-55) with Gather; the harvest
//   cap and a gather in progress disable it with a visible reason; every pool Exhausted adds one
//   summary line under the cards.
// - Also here: the NPC, bind stone, object and player rows as before; labelled only when a group
//   above renders. 'No one is nearby.' only when all of it is empty.
// The pool groups wait for the place's pool rows (poolsAppliedFor), so nothing flashes empty. Card
// actions go through the console (consoleApi.pull / fight / gather) inside the action runner: inert
// with aria-busy while pending, aria-disabled offline, a rejected send prints the send error line,
// and nothing changes optimistically. The rail is the Encounter panel in a fight (and the Map sheet
// cannot open in combat), so the cards carry no in-combat state of their own.
// Rows: every row ends its action cluster with an Examine eye beside the row's main part, never
// inside it. NPC rows talk through a chat bubble button; a bind stone row offers Bind (bind_location)
// and turns to 'Bound here' only when the character row says so. A player row (51.1) lists only
// online characters and ends Whisper, Examine and the role-aware menu (PlayerMenu, opening to the
// left in the rail); right-click opens that menu on desktop. Invite lives in the menu. Talk to uses
// the plain chat circle so Whisper keeps its own icon. Names are server or player text, rendered as
// text nodes only. No table lists examinable objects at a location (research Q3, UI-SPEC A7).
const game = inject(GAME_KEY, createInertGame());
const consoleApi = inject(CONSOLE_KEY, createInertConsole());
const frame = inject(FRAME_KEY, createInertFrame());

const connected = computed(() => game.connected.value);

const runner = createActionRunner({ online: connected });

// A rejected Bind, Pull, Fight or Gather (the transport failed, or the call threw) prints the client
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
    players: game.playersHere.value,
    partyIds: partyIds.value,
    objects: [],
    selfId: game.characterId.value,
    bindStone: place.value?.bindStone
      ? { placeName: place.value.name, bound: boundHere.value }
      : null,
  }),
);

const inFight = computed(() => game.combat.active.value);

// Pool cards (51.3.1.1-19) -------------------------------------------------------------------------
const playerLevel = computed(() => game.character.value?.level ?? null);

const placeNoun = computed(() =>
  place.value === null
    ? ''
    : placeNounFor({ placeNoun: place.value.placeNoun, terrainType: place.value.terrainType }),
);

// The place's pool rows have applied (51.3.1.1-18): until then no pool group renders. The named
// group does not wait on them (WR-04); a failed pool subscription shows one quiet line.
const ready = computed(() => place.value !== null && game.poolsAppliedFor(place.value.id));
const poolsFailed = computed(() => place.value !== null && game.poolsFailed.value);

// Day or night (D-55): the frame carries it from world_state, the value the header shows
// (51.3.1.1-31). Unknown (null) lists every resource pool; the server still refuses a gather out of
// its time.
const isNight = computed<boolean | null>(() => {
  const time = frame.timeOfDay.value;
  return time === null ? null : time === 'night';
});

// The server clock for the harvest cap: refreshed whenever the caps change and again when the
// soonest cap runs out, so Gather frees itself without a reload.
function serverNow(): bigint {
  return BigInt(Math.floor(game.clock.nowMicros()));
}

const nowMicros = ref(serverNow());
let capTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_TIMEOUT_MS = 2_147_483_647;

function clearCapTimer(): void {
  if (capTimer !== null) clearTimeout(capTimer);
  capTimer = null;
}

function refreshNow(): void {
  clearCapTimer();
  const now = serverNow();
  nowMicros.value = now;
  let soonest: bigint | null = null;
  for (const cap of game.harvestCaps.value) {
    if (cap.cappedUntilMicros > now && (soonest === null || cap.cappedUntilMicros < soonest)) {
      soonest = cap.cappedUntilMicros;
    }
  }
  if (soonest === null) return;
  const ms = Math.min(Number((soonest - now) / 1000n) + 50, MAX_TIMEOUT_MS);
  capTimer = setTimeout(refreshNow, ms);
}

watch(() => game.harvestCaps.value, refreshNow, { immediate: true });
onBeforeUnmount(clearCapTimer);

// Active quests that target an enemy template: the named card's 'Quest: {name}' part.
const questTargets = computed<QuestTargetLike[]>(() => {
  const templates = new Map(game.questTemplates.value.map((template) => [template.id, template]));
  const out: QuestTargetLike[] = [];
  for (const quest of game.quests.value) {
    if (quest.completed) continue;
    const template = templates.get(quest.questTemplateId);
    if (!template || template.targetEnemyTemplateId <= 0n) continue;
    out.push({ name: template.name, targetEnemyTemplateId: template.targetEnemyTemplateId });
  }
  return out;
});

const families = computed(() => familyRows(game.poolLevelsHere.value, playerLevel.value, placeNoun.value));

// The templates of the spawns here and of the own named enemies (51.3.1.1-31, D-39): level, con
// colour and Boss for the named cards. namedRows maps them by id, so a template in both is harmless.
// A named enemy's level is scaled to this place the way the server levels it (WR-03): the place
// target from its region's danger multiplier and its own level offset. Unknown until the place and
// its region rows are loaded, and then the cards omit the level.
const namedPlace = computed<NamedPlace | null>(() => {
  const location = place.value;
  if (location === null) return null;
  if (!game.regions.value.some((region) => region.id === location.regionId)) return null;
  return { target: placeTargetLevel(location, game.regions.value), levelOffset: location.levelOffset };
});

const named = computed(() => {
  const here = place.value?.id ?? null;
  return namedRows(
    game.namedEnemies.value.filter((enemy) => enemy.locationId === here),
    game.enemiesHere.value,
    [...game.enemyTemplatesHere.value, ...game.namedEnemyTemplates.value],
    questTargets.value,
    playerLevel.value,
    namedPlace.value,
  );
});

// A gather in progress: the server refuses a pull, a spawn fight and a second gather (review C IN-04),
// so Pull, Fight and Gather all show the same visible reason.
const gathering = computed(() => game.gathers.value.length > 0);
const gatherBlock = computed(() => (gathering.value ? GATHER_BUSY_REASON : null));

const resources = computed(() =>
  resourceRows(
    game.poolLevelsHere.value,
    isNight.value,
    game.harvestCaps.value,
    gathering.value,
    nowMicros.value,
    placeNoun.value,
  ),
);

// With no place (no character yet, or a location row not loaded) there are no pools to wait for and
// no Creatures group: only the Also here rows and, with none, the Phase 45 empty line.
const groups = computed(() =>
  nearbyGroups({
    isSafe: place.value === null || place.value.isSafe,
    isUncharted: place.value?.terrainType === 'uncharted',
    ready: place.value === null || ready.value,
    families: families.value,
    named: named.value,
    resources: resources.value,
    place: placeNoun.value,
    others: rows.value.length,
    failed: poolsFailed.value,
  }),
);

const pullKey = (row: FamilyRow): string => `pull-${row.poolId}`;
const fightKey = (row: NamedRow): string => `fight-${row.key}`;
const gatherKey = (row: ResourceRow): string => `gather-${row.poolId}`;

// Each call runs inside the action runner: a second click while pending is ignored, a rejected
// reducer promise (the console passes it on, 51.3.1.1-31) and a synchronous failure both count as a
// rejection (the send error line), and nothing changes optimistically. The server's results and
// refusals arrive as feed lines and row updates.
function pull(row: FamilyRow): void {
  if (!connected.value || !row.pullable || gathering.value) return;
  void runner.run(pullKey(row), async () => consoleApi.pull({ id: row.poolId, name: row.name }));
}

function fight(row: NamedRow): void {
  if (!connected.value || !row.fightable || gathering.value) return;
  void runner.run(fightKey(row), async () => consoleApi.fight({ kind: row.kind, id: row.id, name: row.name }));
}

function gather(row: ResourceRow): void {
  if (!connected.value || !row.gatherable || row.reason !== null) return;
  void runner.run(gatherKey(row), async () => consoleApi.gather({ id: row.poolId, name: row.name }));
}

const ICONS: Record<NearbyKind, Component> = {
  npc: PhUser,
  bindStone: PhCastleTurret,
  object: PhCircleDashed,
  player: PhUserCircle,
};

function rowKey(row: NearbyRow): string {
  return `${row.kind}-${row.id}`;
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

// Focus after a row goes (51.1 review client-rest WR-03, the shared keepFocus rule; pool keys from
// 51.3.1.1-19): players drop out when they log out or walk away, a family's Pull goes at level 0, a
// named enemy's Fight when it is slain, and a row's controls change with its state. Focus held on a
// removed control moves to the first button of the item now at that index across every group (the
// next item, or the same one when only a control went), else the Nearby heading.
function nearbyItems(area: HTMLElement): HTMLElement[] {
  return Array.from(area.querySelectorAll<HTMLElement>('li.nearby-item'));
}

keepFocus<number>({
  source: () =>
    [
      ...(groups.value.creatures?.rows ?? []).map((row) => `family-${row.poolId}-${row.badgeLevel}`),
      groups.value.creatures?.emptyLine ?? '',
      ...(groups.value.named ?? []).map((row) => `named-${row.key}-${row.state}`),
      ...(groups.value.resources?.rows ?? []).map(
        (row) => `resource-${row.poolId}-${row.badgeLevel}-${row.capped ? 1 : 0}`,
      ),
      ...rows.value.map((row) => `${rowKey(row)}-${row.bound ? 1 : 0}`),
    ].join(','),
  area: () => list.value,
  capture: (active, area) => {
    const item = active.closest<HTMLElement>('li.nearby-item');
    return item === null ? -1 : nearbyItems(area).indexOf(item);
  },
  restore: (index) => {
    const after = list.value === null ? [] : nearbyItems(list.value).slice(Math.max(index, 0));
    const next = after.map((item) => item.querySelector<HTMLElement>('button')).find((b) => b !== null);
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
    <p v-if="groups.nothingAtAll" class="empty">No one is nearby.</p>
    <div v-else ref="list" class="groups">
      <p v-if="groups.loadFailedLine" class="group-empty" role="status">{{ groups.loadFailedLine }}</p>
      <div v-if="groups.creatures" class="nearby-group">
        <h6>{{ NEARBY_COPY.groups.creatures }}</h6>
        <ul v-if="groups.creatures.rows.length > 0" class="cards">
          <PoolCard
            v-for="row in groups.creatures.rows"
            :key="`family-${row.poolId}`"
            variant="family"
            :row="row"
            :offline="!connected"
            :blocked-reason="gatherBlock"
            :busy="runner.isPending(pullKey(row))"
            @act="pull(row)"
          />
        </ul>
        <p v-if="groups.creatures.emptyLine" class="group-empty">{{ groups.creatures.emptyLine }}</p>
      </div>
      <div v-if="groups.named" class="nearby-group">
        <h6>{{ NEARBY_COPY.groups.named }}</h6>
        <ul class="cards">
          <PoolCard
            v-for="row in groups.named"
            :key="row.key"
            variant="named"
            :row="row"
            :offline="!connected"
            :blocked-reason="gatherBlock"
            :busy="runner.isPending(fightKey(row))"
            @act="fight(row)"
          />
        </ul>
      </div>
      <div v-if="groups.resources" class="nearby-group">
        <h6>{{ NEARBY_COPY.groups.resources }}</h6>
        <ul class="cards">
          <PoolCard
            v-for="row in groups.resources.rows"
            :key="`resource-${row.poolId}`"
            variant="resource"
            :row="row"
            :offline="!connected"
            :busy="runner.isPending(gatherKey(row))"
            @act="gather(row)"
          />
        </ul>
        <p v-if="groups.resources.summary" class="group-empty">{{ groups.resources.summary }}</p>
      </div>
      <div v-if="rows.length > 0" class="also-here" :class="{ 'nearby-group': groups.alsoHereLabel }">
        <h6 v-if="groups.alsoHereLabel">{{ NEARBY_COPY.groups.alsoHere }}</h6>
        <ul class="rows">
          <li
            v-for="row in rows"
            :key="rowKey(row)"
            class="nearby-row nearby-item"
            :class="[`kind-${row.kind}`, { bound: row.bound }]"
            @contextmenu="onContextMenu($event, row)"
          >
            <div class="row-main static">
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
      </div>
    </div>
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

/* The groups stack 16 apart (UI-SPEC Spacing md); the cards inside a group 8 apart. */
.groups {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 'Nothing hunts here now.' and the all-Exhausted summary: a quiet boxed line. */
.group-empty {
  margin: 0;
  padding: 8px;
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 0 1px var(--color-neutral-800);
  font-size: 12px;
  font-style: italic;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.cards + .group-empty {
  margin-top: 8px;
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
