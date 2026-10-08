<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { PhCrosshairSimple, PhCrownSimple, PhWarningCircle } from '@phosphor-icons/vue';
import {
  COMBAT_KEY,
  FRAME_KEY,
  GAME_KEY,
  createInertCombat,
  createInertFrame,
  createInertGame,
} from '../game/context';
import { memberBars } from '../rails/party';
import type { MemberBar, PartyMemberView } from '../rails/party';
import CharacterName from './CharacterName.vue';
import FollowIcon from './FollowIcon.vue';
import PlayerMenu from './PlayerMenu.vue';
import StatusDot from './StatusDot.vue';
import { followPhrase } from './follow';
import type { FollowState } from './follow';

// One party member out of combat (51.1-UI-SPEC "Vitals Rail Party Block", out of combat item 6):
// a div laid out as [content][⋯]. The content holds the status dot, the name, the crown for the
// leader, the class (it ellipsizes first), then the follow icon and the 51 'Lv {n} · {s} st' with
// its low mark, and the 4px health bar, the 3px mana bar for a member with mana and the 3px stamina
// bar (memberBars, owner 2026-10-08). The ⋯ (PlayerMenu) is the card's last
// child, never inside a button; right-click on the card opens the same menu (desktop only).
// An offline member is muted; a member whose character row has not applied is the unknown card
// ('Member', muted, no dot, follow icon or ⋯). Names and classes are server text, text nodes only.
//
// The rail card is an ally target out of combat too (owner 2026-10-08: tap a party member to target
// them, everywhere): for a known member the content is a button.member-target, built from spans only,
// beside the ⋯ (never around it), as CombatMemberCard does in a fight. A click selects the member
// (controller.selectAlly); right-click still opens the menu and never changes the target. The selected
// card wears the accent ring and a 12px crosshair first in the name row. A member who cannot be
// selected out of combat (offline, not here: controller.canSelectAlly) is aria-disabled and muted.
//
// The sheet variant is the mobile Party sheet card (51.1-UI-SPEC "Mobile Party Sheet" items 5 and 6):
// [dot][name][crown][follow icon], then 'Lv {n} · {Here | place | Offline} · {s} st' (the place
// ellipsizes first), the same three bars for a known member (owner 2026-10-08), and the 44px ⋯. With `self` it is your own card: your
// name with ' (you)', your follow state, 'Lv {n} · {s} st' and no bars (your bars are in the header
// strip). The rail variant is the desktop rail.
const props = withDefaults(
  defineProps<{
    member: PartyMemberView;
    state: FollowState | null;
    variant?: 'rail' | 'sheet';
    self?: boolean;
    fallbackFocus?: () => HTMLElement | null;
  }>(),
  { variant: 'rail', self: false, fallbackFocus: undefined },
);

const frame = inject(FRAME_KEY, createInertFrame());
const game = inject(GAME_KEY, createInertGame());
const controller = inject(COMBAT_KEY, createInertCombat());

const isSheet = computed(() => props.variant === 'sheet');

// The place text of a sheet member card: Offline for an offline member, Here at your place, else the
// place name from game.locations. Null (no text) until the place row is known, never a wrong place.
const place = computed<string | null>(() => {
  if (!isSheet.value || props.self || !known.value) return null;
  if (!props.member.online) return 'Offline';
  const at = props.member.locationId;
  if (at === null) return null;
  const mine = game.character.value?.locationId;
  if (mine !== undefined && mine === at) return 'Here';
  const found = game.locations.value.find((location) => location.id === at);
  return found === undefined ? null : found.name;
});

const menu = ref<InstanceType<typeof PlayerMenu> | null>(null);

const known = computed(() => props.member.known);
const label = computed(() => (known.value ? props.member.name : 'Member'));
const offline = computed(() => known.value && !props.member.online);

// The rail target (owner 2026-10-08). The sheet cards stay plain cards.
const isTarget = computed(() => !isSheet.value && known.value);
const selectable = computed(() => controller.canSelectAlly(props.member.id));
const selected = computed(() => isTarget.value && controller.allyTargetId.value === props.member.id);
const muted = computed(() => !known.value || !props.member.online || (isTarget.value && !selectable.value));
const statusWord = computed(() => (props.member.online ? 'online' : 'offline'));

// Stamina text (51-UI-SPEC "Party Stamina in the Vitals Rail"): the low mark means the member cannot
// afford even a within-region trip; the rule lives in @game-data/travel_config and party.ts applies it.
const staminaText = computed(() => `Stamina ${props.member.stamina} of ${props.member.maxStamina}`);
const staminaScreenText = computed(() =>
  props.member.lowStamina ? `${staminaText.value}, too low to travel` : staminaText.value,
);

// A bar's progressbar semantics. An unknown member (no character row yet) has no real values (all
// 0, max 0), so its empty tracks stay as the 47 dimmed look but are hidden from assistive technology
// instead of reading "Member health 0 of 0" (51.1 review client-social IN-07).
function barAttrs(bar: MemberBar): Record<string, string | number> {
  if (!known.value) return { 'aria-hidden': 'true' };
  return {
    role: 'progressbar',
    'aria-label': `${label.value} ${bar.phrase}`,
    'aria-valuemin': 0,
    'aria-valuenow': Number(bar.value),
    'aria-valuemax': Number(bar.max),
    title: bar.title,
  };
}

// The card's bars (owner 2026-10-08): health, mana only for a member with mana, then stamina. The
// rail keeps the dimmed empty tracks of an unknown member; the sheet shows bars for a known member who
// is not you (your own bars are in the header strip).
const bars = computed(() => memberBars(props.member));
const showBars = computed(() => !isSheet.value || (known.value && !props.self));

// 'Target {name} with your next ability. {class}{, party leader}, level {n}, health {hp} of {max}
// {, mana {m} of {max}}, stamina {s} of {max}{, too low to travel}{, follow phrase}{, offline}
// {, not here}.' The selected state is aria-pressed, as on every other target button.
const targetLabel = computed(() => {
  const m = props.member;
  const parts: string[] = [];
  if (m.className.length > 0) parts.push(m.className);
  if (m.isLeader) parts.push('party leader');
  parts.push(`level ${m.level}`, ...bars.value.map((bar) => bar.phrase));
  if (m.lowStamina) parts.push('too low to travel');
  if (props.state !== null) parts.push(followPhrase(props.state));
  const mine = game.character.value?.locationId ?? null;
  if (!m.online) parts.push('offline');
  else if (mine !== null && m.locationId !== null && m.locationId !== mine) parts.push('not here');
  return `Target ${m.name} with your next ability. ${parts.join(', ')}.`;
});

// The content element's attributes: a target button in the rail for a known member, else a plain div.
const contentTag = computed(() => (isTarget.value ? 'button' : 'div'));
const contentAttrs = computed(() => {
  if (!isTarget.value) return { class: 'content' };
  return {
    type: 'button',
    class: 'content member-target',
    'aria-pressed': selected.value ? 'true' : 'false',
    'aria-label': targetLabel.value,
    'aria-disabled': selectable.value ? undefined : 'true',
    onClick: () => controller.selectAlly(props.member.id),
  };
});

// Right-click opens the card's menu: always in the desktop rail, on desktop only for the sheet
// (no long-press on touch). Nothing is prevented when the card has no menu.
function onContextMenu(event: MouseEvent): void {
  if (!known.value || menu.value === null) return;
  if (props.variant === 'sheet' && !frame.isDesktop.value) return;
  event.preventDefault();
  menu.value.open('first');
}
</script>

<template>
  <div
    class="member-card"
    :class="{ muted, offline, unknown: !known, sheet: isSheet, self: props.self, selected }"
    @contextmenu="onContextMenu"
  >
    <component :is="contentTag" v-bind="contentAttrs">
      <span class="member-row">
        <PhCrosshairSimple v-if="selected" class="marker" weight="fill" :size="12" aria-hidden="true" />
        <StatusDot v-if="known" :status="member.online ? 'online' : 'offline'" />
        <CharacterName class="member-name" :name="label" :you="props.self" />
        <PhCrownSimple v-if="member.isLeader && isTarget" class="crown" weight="fill" :size="12" aria-hidden="true" />
        <PhCrownSimple
          v-else-if="member.isLeader"
          class="crown"
          weight="fill"
          :size="12"
          role="img"
          aria-label="Party leader"
        />
        <span v-if="known" class="sr-only status-word">{{ statusWord }}</span>
        <FollowIcon v-if="isSheet && known && state !== null" :state="state" />
        <span v-if="!isSheet" class="member-class">{{ member.className }}</span>
        <span v-if="known && !isSheet" class="right">
          <FollowIcon v-if="state !== null" :state="state" :decorative="isTarget" />
          <span class="member-level" :title="staminaText"
            >Lv {{ member.level }}<span class="member-stamina" :class="{ low: member.lowStamina }" aria-hidden="true"
              >{{ ' · ' }}<PhWarningCircle v-if="member.lowStamina" class="low-icon" :size="12" />{{
                `${member.stamina} st`
              }}</span
            ></span
          >
        </span>
        <span v-if="known" class="sr-only stamina-sr">{{ staminaScreenText }}</span>
      </span>
      <span v-if="isSheet && known" class="member-line" :title="staminaText">
        <span class="line-fixed">{{ `Lv ${member.level}${' · '}` }}</span>
        <span v-if="place !== null" class="member-place" :title="place">{{ place }}</span>
        <span v-if="place !== null" class="line-fixed" aria-hidden="true">{{ ' · ' }}</span>
        <span class="line-fixed member-stamina" :class="{ low: member.lowStamina }" aria-hidden="true"
          ><PhWarningCircle v-if="member.lowStamina" class="low-icon" :size="12" />{{ `${member.stamina} st` }}</span
        >
      </span>
      <template v-if="showBars">
        <span v-for="bar in bars" :key="bar.kind" class="track" :class="`${bar.kind}-track`" v-bind="barAttrs(bar)">
          <span class="fill" :class="`fill-${bar.kind}`" :style="{ width: bar.width }"></span>
        </span>
      </template>
    </component>
    <PlayerMenu
      v-if="known"
      ref="menu"
      class="member-menu"
      :target-id="member.id"
      side="right"
      :size="isSheet ? 'sheet' : 'rail'"
      :fallback-focus="fallbackFocus"
    />
  </div>
</template>

<style scoped>
.member-card {
  display: flex;
  align-items: flex-start;
  min-width: 0;
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

/* The 48 member-card hover and pressed tints, drawn on the whole card (as CombatMemberCard). */
.member-card:has(> .member-target:hover) {
  background: color-mix(in srgb, var(--color-text) 7%, var(--color-surface));
}

.member-card:has(> .member-target:active) {
  background: color-mix(in srgb, var(--color-text) 14%, var(--color-surface));
}

.member-card.selected {
  box-shadow:
    inset 0 0 0 1px var(--color-accent),
    0 0 12px color-mix(in srgb, var(--color-accent) 30%, transparent);
}

.content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 8px;
}

/* The rail target button (owner 2026-10-08), the CombatMemberCard recipe. */
.member-target {
  box-sizing: border-box;
  width: 100%;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.member-target:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.member-target[aria-disabled='true'] {
  cursor: default;
}

.marker {
  flex: none;
  color: var(--color-accent);
}

.member-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.member-name {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
}

.muted .member-name {
  color: var(--color-neutral-500);
}

.crown {
  flex: none;
  color: var(--color-accent);
}

/* The class gives way first, then the name. */
.member-class {
  flex: 1 1 0;
  min-width: 0;
  font-size: 10px;
  color: var(--color-neutral-500);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.right {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.member-level {
  font-size: 10px;
  color: var(--color-neutral-400);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.member-stamina {
  font-variant-numeric: tabular-nums;
}

.member-stamina.low {
  color: var(--color-con-red);
}

.low-icon {
  margin-right: 4px;
  vertical-align: text-bottom;
}

.track {
  display: block;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
  overflow: hidden;
}

.muted .track {
  opacity: 0.45;
}

.health-track {
  height: 4px;
}

.mana-track,
.stamina-track {
  height: 3px;
}

.fill {
  display: block;
  height: 100%;
}

.fill-health {
  background: var(--color-health);
}

.fill-mana {
  background: var(--color-mana);
}

.fill-stamina {
  background: var(--color-stamina);
}

/* The sheet card (UI-SPEC Mobile Party Sheet): a darker card, 8px 16px, the 44px ⋯ centred beside the
   content. The Lv line keeps its parts whole and only the place ellipsizes. */
.member-card.sheet {
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--color-bg);
}

.sheet .content {
  padding: 0;
}

.sheet .member-menu {
  margin: 0;
}

.member-line {
  display: flex;
  align-items: baseline;
  min-width: 0;
  font-size: 12px;
  color: var(--color-neutral-500);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.line-fixed {
  flex: none;
  white-space: pre;
}

.member-place {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The ⋯ column (UI-SPEC Exceptions): 28px wide, top-aligned, a sibling of the content. */
.member-menu {
  margin: 4px 4px 0 0;
}

/* An open menu marks its card (UI-SPEC Interaction States); the target ring wins over it. */
.member-card:not(.selected):has(.menu-opener[aria-expanded='true']) {
  box-shadow: inset 0 0 0 1px var(--color-neutral-600);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
