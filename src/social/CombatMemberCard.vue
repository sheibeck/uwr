<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { PhCrosshairSimple, PhCrownSimple } from '@phosphor-icons/vue';
import { COMBAT_KEY, GAME_KEY, createInertCombat, createInertGame } from '../game/context';
import { barFraction } from '../frame/vitals';
import EffectChips from '../rails/EffectChips.vue';
import { effectViews } from '../rails/effects';
import type { PartyMemberView } from '../rails/party';
import CharacterName from './CharacterName.vue';
import FollowIcon from './FollowIcon.vue';
import PlayerMenu from './PlayerMenu.vue';
import { followPhrase } from './follow';
import type { FollowState } from './follow';

// One party member in a fight (51.1-UI-SPEC "Vitals Rail Party Block", In combat (COMBAT3 7a)):
// a div holding two siblings, the ally target button and the ⋯ (PlayerMenu), never one inside the
// other. The button is built from spans only (phrasing content, as HostileCard does): the header
// (crosshair when this member is the ally target, name, crown, class or 'Offline', then the follow
// icon and 'Lv {n}'), the 4px HP bar, the 3px mana bar for members with mana, the 3px stamina bar
// and the member's effect chips. The HP numbers are in the bar's title and the button's accessible
// name, never visible text. Selecting is client state (controller.selectAlly); the server checks the
// ally when the ability resolves. An offline member is muted and still a target; a member whose
// character row has not applied is a plain 'Member' div. Names, classes and effect names are server
// text, rendered as text nodes and attribute bindings only.
const props = withDefaults(
  defineProps<{
    member: PartyMemberView;
    state: FollowState | null;
    fallbackFocus?: () => HTMLElement | null;
  }>(),
  { fallbackFocus: undefined },
);

const game = inject(GAME_KEY, createInertGame());
const controller = inject(COMBAT_KEY, createInertCombat());

const menu = ref<InstanceType<typeof PlayerMenu> | null>(null);

const known = computed(() => props.member.known);
const offline = computed(() => known.value && !props.member.online);
const muted = computed(() => !known.value || !props.member.online);
const selected = computed(() => known.value && controller.allyTargetId.value === props.member.id);
const hasMana = computed(() => props.member.resourceKind === 'mana');

// The member's own chips from the party's effect rows, with rounds left (this card shows in a fight).
const effects = computed(() => effectViews(game.effects.value, props.member.id, true));

const healthTitle = computed(() => `Health ${props.member.hp}/${props.member.maxHp}`);
const manaTitle = computed(() => `Mana ${props.member.resource}/${props.member.maxResource}`);
const staminaTitle = computed(() => `Stamina ${props.member.stamina}/${props.member.maxStamina}`);

// 'Target {name} with your next ability. {class}, level {n}, health {hp} of {max}, {follow phrase}
// {, offline}{. Effects: {texts}}.' (UI-SPEC Accessibility Contract: HP numbers in the name).
const label = computed(() => {
  const m = props.member;
  const parts: string[] = [];
  if (m.className.length > 0) parts.push(m.className);
  parts.push(`level ${m.level}`, `health ${m.hp} of ${m.maxHp}`);
  if (props.state !== null) parts.push(followPhrase(props.state));
  if (offline.value) parts.push('offline');
  const effectText = effects.value.length > 0 ? `. Effects: ${effects.value.map((view) => view.text).join(', ')}` : '';
  return `Target ${m.name} with your next ability. ${parts.join(', ')}${effectText}.`;
});

function pct(value: bigint, max: bigint): string {
  return `${barFraction(value, max) * 100}%`;
}

function select(): void {
  controller.selectAlly(props.member.id);
}

// Right-click on the card opens its menu (the rail is desktop only); the target does not change.
// Nothing is prevented when the card has no menu.
function onContextMenu(event: MouseEvent): void {
  if (!known.value || menu.value === null) return;
  event.preventDefault();
  menu.value.open('first');
}
</script>

<template>
  <div class="member-card" :class="{ muted, offline, unknown: !known, selected }" @contextmenu="onContextMenu">
    <button
      v-if="known"
      type="button"
      class="member-target"
      :aria-pressed="selected ? 'true' : 'false'"
      :aria-label="label"
      @click="select"
    >
      <span class="member-row">
        <PhCrosshairSimple v-if="selected" class="marker" weight="fill" :size="12" aria-hidden="true" />
        <CharacterName class="member-name" :name="member.name" />
        <PhCrownSimple v-if="member.isLeader" class="crown" weight="fill" :size="12" aria-hidden="true" />
        <span class="member-class">{{ offline ? 'Offline' : member.className }}</span>
        <span class="right">
          <FollowIcon v-if="state !== null" :state="state" decorative />
          <span class="member-level">Lv {{ member.level }}</span>
        </span>
      </span>
      <span class="bars">
        <span
          class="track health-track"
          role="progressbar"
          :title="healthTitle"
          :aria-label="`${member.name} health`"
          aria-valuemin="0"
          :aria-valuenow="Number(member.hp)"
          :aria-valuemax="Number(member.maxHp)"
        >
          <span class="fill fill-health" :style="{ width: pct(member.hp, member.maxHp) }"></span>
        </span>
        <span
          v-if="hasMana"
          class="track mana-track"
          role="progressbar"
          :title="manaTitle"
          :aria-label="`${member.name} mana`"
          aria-valuemin="0"
          :aria-valuenow="Number(member.resource)"
          :aria-valuemax="Number(member.maxResource)"
        >
          <span class="fill fill-mana" :style="{ width: pct(member.resource, member.maxResource) }"></span>
        </span>
        <span
          class="track stamina-track"
          role="progressbar"
          :title="staminaTitle"
          :aria-label="`${member.name} stamina`"
          aria-valuemin="0"
          :aria-valuenow="Number(member.stamina)"
          :aria-valuemax="Number(member.maxStamina)"
        >
          <span class="fill fill-stamina" :style="{ width: pct(member.stamina, member.maxStamina) }"></span>
        </span>
      </span>
      <EffectChips class="member-effects" :effects="effects" inline dense />
    </button>
    <div v-else class="member-target-static">
      <span class="member-row">
        <CharacterName class="member-name" name="Member" />
        <PhCrownSimple v-if="member.isLeader" class="crown" weight="fill" :size="12" role="img" aria-label="Party leader" />
      </span>
    </div>
    <PlayerMenu
      v-if="known"
      ref="menu"
      class="member-menu"
      :target-id="member.id"
      side="right"
      size="rail"
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

/* The 48 member-card hover and pressed tints, drawn on the whole card. */
.member-card:has(> .member-target:hover) {
  background: color-mix(in srgb, var(--color-text) 7%, var(--color-surface));
}

.member-card:has(> .member-target:active) {
  background: color-mix(in srgb, var(--color-text) 14%, var(--color-surface));
}

/* An open menu marks its card (UI-SPEC Interaction States); the target ring wins over it. */
.member-card:not(.selected):has(.menu-opener[aria-expanded='true']) {
  box-shadow: inset 0 0 0 1px var(--color-neutral-600);
}

.member-card.selected {
  box-shadow:
    inset 0 0 0 1px var(--color-accent),
    0 0 12px color-mix(in srgb, var(--color-accent) 30%, transparent);
}

.member-target,
.member-target-static {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 8px;
}

.member-target {
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

.member-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.marker {
  flex: none;
  color: var(--color-accent);
}

/* The class gives way first, then the name; the right group keeps its width. */
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
  font-size: 10px;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
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

/* The ⋯ column (UI-SPEC Exceptions): 28px wide, top-aligned, a sibling of the target button. */
.member-menu {
  margin: 4px 4px 0 0;
}
</style>
