<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { PhCrownSimple, PhWarningCircle } from '@phosphor-icons/vue';
import { FRAME_KEY, createInertFrame } from '../game/context';
import { barFraction } from '../frame/vitals';
import type { PartyMemberView } from '../rails/party';
import CharacterName from './CharacterName.vue';
import FollowIcon from './FollowIcon.vue';
import PlayerMenu from './PlayerMenu.vue';
import StatusDot from './StatusDot.vue';
import type { FollowState } from './follow';

// One party member out of combat (51.1-UI-SPEC "Vitals Rail Party Block", out of combat item 6):
// a div laid out as [content][⋯]. The content holds the status dot, the name, the crown for the
// leader, the class (it ellipsizes first), then the follow icon and the 51 'Lv {n} · {s} st' with
// its low mark, and the 4px health and 3px resource bars. The ⋯ (PlayerMenu) is the card's last
// child, never inside a button; right-click on the card opens the same menu (desktop only).
// An offline member is muted; a member whose character row has not applied is the unknown card
// ('Member', muted, no dot, follow icon or ⋯). Names and classes are server text, text nodes only.
// The sheet variant (Plan 16) uses the 44px opener; the rail variant is the desktop rail.
const props = withDefaults(
  defineProps<{
    member: PartyMemberView;
    state: FollowState | null;
    variant?: 'rail' | 'sheet';
    fallbackFocus?: () => HTMLElement | null;
  }>(),
  { variant: 'rail', fallbackFocus: undefined },
);

const frame = inject(FRAME_KEY, createInertFrame());

const menu = ref<InstanceType<typeof PlayerMenu> | null>(null);

const known = computed(() => props.member.known);
const label = computed(() => (known.value ? props.member.name : 'Member'));
const offline = computed(() => known.value && !props.member.online);
const muted = computed(() => !known.value || !props.member.online);
const statusWord = computed(() => (props.member.online ? 'online' : 'offline'));

// Stamina text (51-UI-SPEC "Party Stamina in the Vitals Rail"): the low mark means the member cannot
// afford even a within-region trip; the rule lives in @game-data/travel_config and party.ts applies it.
const staminaText = computed(() => `Stamina ${props.member.stamina} of ${props.member.maxStamina}`);
const staminaScreenText = computed(() =>
  props.member.lowStamina ? `${staminaText.value}, too low to travel` : staminaText.value,
);

function pct(value: bigint, max: bigint): string {
  return `${barFraction(value, max) * 100}%`;
}

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
  <div class="member-card" :class="{ muted, offline, unknown: !known }" @contextmenu="onContextMenu">
    <div class="content">
      <div class="member-row">
        <StatusDot v-if="known" :status="member.online ? 'online' : 'offline'" />
        <CharacterName class="member-name" :name="label" />
        <PhCrownSimple v-if="member.isLeader" class="crown" weight="fill" :size="12" aria-label="Party leader" />
        <span v-if="known" class="sr-only status-word">{{ statusWord }}</span>
        <span class="member-class">{{ member.className }}</span>
        <span v-if="known" class="right">
          <FollowIcon v-if="state !== null" :state="state" />
          <span class="member-level" :title="staminaText"
            >Lv {{ member.level }}<span class="member-stamina" :class="{ low: member.lowStamina }" aria-hidden="true"
              >{{ ' · ' }}<PhWarningCircle v-if="member.lowStamina" class="low-icon" :size="12" />{{
                `${member.stamina} st`
              }}</span
            ></span
          >
        </span>
        <span v-if="known" class="sr-only stamina-sr">{{ staminaScreenText }}</span>
      </div>
      <div
        class="track health-track"
        role="progressbar"
        :aria-label="`${label} health ${member.hp} of ${member.maxHp}`"
        aria-valuemin="0"
        :aria-valuenow="Number(member.hp)"
        :aria-valuemax="Number(member.maxHp)"
      >
        <div class="fill fill-health" :style="{ width: pct(member.hp, member.maxHp) }"></div>
      </div>
      <div
        class="track resource-track"
        role="progressbar"
        :aria-label="`${label} ${member.resourceKind} ${member.resource} of ${member.maxResource}`"
        aria-valuemin="0"
        :aria-valuenow="Number(member.resource)"
        :aria-valuemax="Number(member.maxResource)"
      >
        <div
          class="fill"
          :class="member.resourceKind === 'mana' ? 'fill-mana' : 'fill-stamina'"
          :style="{ width: pct(member.resource, member.maxResource) }"
        ></div>
      </div>
    </div>
    <PlayerMenu
      v-if="known"
      ref="menu"
      class="member-menu"
      :target-id="member.id"
      side="right"
      :size="variant === 'sheet' ? 'sheet' : 'rail'"
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

.content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 8px;
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

.resource-track {
  height: 3px;
}

.fill {
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

/* The ⋯ column (UI-SPEC Exceptions): 28px wide, top-aligned, a sibling of the content. */
.member-menu {
  margin: 4px 4px 0 0;
}

/* An open menu marks its card (UI-SPEC Interaction States). */
.member-card:has(.menu-opener[aria-expanded='true']) {
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
