<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue';
import type { Component } from 'vue';
import {
  PhArrowBendUpRight,
  PhCaretDown,
  PhCastleTurret,
  PhDoorOpen,
  PhHammer,
  PhHourglassMedium,
  PhQuestion,
  PhShieldCheck,
  PhSignpost,
  PhStorefront,
  PhSword,
  PhVault,
  PhWarningCircle,
} from '@phosphor-icons/vue';
import type { DetailTag, TravelAction } from './detailModel';
import type { Destination } from './useDestination';

// The mobile dock (51-UI-SPEC "Mobile map (sheet)"): the selected destination under the canvas, in
// the UI-SPEC order. It reads the same destination model as the desktop detail column (useDestination),
// so it shows what DetailView says and runs the one shared action runner: Travel calls move_character
// through it, the sheet stays open, and a refusal shows in the sheet's notice line. Nothing here
// decides who can travel; the fail line only joins the labels of the checks that are not ok.
// Every string is a text node or a bound attribute.
const props = defineProps<{ destination: Destination }>();

const uid = useId();
const nameElement = useTemplateRef<HTMLElement>('nameElement');
const detailsOpen = ref(false);

const detail = computed(() => props.destination.detail.value);
const pending = computed(() => props.destination.runner.pending.value.has('travel'));

const TAG_ICONS: Record<Exclude<DetailTag['icon'], 'terrain'>, Component> = {
  sword: PhSword,
  shield: PhShieldCheck,
  question: PhQuestion,
  castle: PhCastleTurret,
  hammer: PhHammer,
};

function tagIcon(tag: DetailTag): Component {
  return tag.icon === 'terrain' ? detail.value!.terrain.icon : TAG_ICONS[tag.icon];
}

const SERVICE_ICONS: Record<'Vendor' | 'Banker', Component> = { Vendor: PhStorefront, Banker: PhVault };

const ACTION_ICONS: Record<NonNullable<TravelAction['icon']>, Component> = {
  signpost: PhSignpost,
  door: PhDoorOpen,
  hourglass: PhHourglassMedium,
  firstStop: PhArrowBendUpRight,
};

/**
 * '{n} stamina · {region travel text}', or whichever part exists; null when neither does. A blocked
 * region line ('Blocked · {m:ss} left') is hidden as a whole while its minute sentence speaks for it.
 */
const tripLine = computed(() => {
  const trip = detail.value?.trip;
  if (!trip || (trip.stamina === null && trip.regionTravel === null)) return null;
  return { stamina: trip.stamina, region: trip.regionTravel };
});

/** The failing check labels (wait or bad) joined with ' · '; null when every check is ok. */
const failLine = computed(() => {
  const checks = detail.value?.checks;
  if (!checks) return null;
  const failing = checks.filter((check) => check.status !== 'ok');
  if (failing.length === 0) return null;
  return {
    text: failing.map((check) => check.label).join(' · '),
    bad: failing.some((check) => check.status === 'bad'),
  };
});

const failId = computed(() => `${uid}-fail`);
const describedBy = computed(() => {
  const action = detail.value?.action;
  if (!action || action.describedBy === null || failLine.value === null) return undefined;
  return failId.value;
});

const showButton = computed(() => {
  const action = detail.value?.action;
  return action !== undefined && action.kind !== 'none';
});

function focusName(): void {
  nameElement.value?.focus();
}

async function onAction(): Promise<void> {
  const action = detail.value?.action;
  if (!action) return;
  if (action.kind === 'firstStop') {
    if (props.destination.selectFirstStop() !== null) {
      await nextTick();
      focusName();
    }
    return;
  }
  if (action.disabled || pending.value) return;
  await props.destination.travel();
}

defineExpose({ focusName });
</script>

<template>
  <div v-if="detail" class="dock">
    <div class="head">
      <span ref="nameElement" class="dock-name" tabindex="-1">{{ detail.title }}</span>
      <span class="dock-region">{{ detail.regionLine }}</span>
    </div>

    <ul class="tags">
      <li v-for="tag in detail.tags" :key="tag.key" class="tag tag-neutral" :style="{ color: tag.color ?? undefined }">
        <component :is="tagIcon(tag)" :size="12" aria-hidden="true" />
        <span>{{ tag.text }}</span>
      </li>
    </ul>

    <div v-if="detail.crossing" class="crossing">
      <PhDoorOpen class="crossing-icon" :size="16" aria-hidden="true" />
      <span class="crossing-line"
        >Crossing into {{ detail.crossing.to }} · <span :style="{ color: detail.crossing.levelColor }">{{ detail.crossing.levelText }}</span></span
      >
    </div>

    <p v-if="tripLine" class="trip-line">
      <template v-if="tripLine.stamina !== null">{{ tripLine.stamina }}</template>
      <template v-if="tripLine.stamina !== null && tripLine.region"> · </template>
      <span v-if="tripLine.region" class="trip-region" :class="`tone-${tripLine.region.tone}`">
        <template v-if="tripLine.region.srText !== null"
          ><span aria-hidden="true">{{ tripLine.region.text }}</span
          ><span class="sr-only">{{ tripLine.region.srText }}</span></template
        >
        <template v-else>{{ tripLine.region.text }}</template>
      </span>
    </p>

    <p v-if="detail.route" class="route-note">{{ detail.route.note }}</p>

    <p v-if="failLine" :id="failId" class="fail-line" :class="failLine.bad ? 'bad' : 'wait'">
      <PhWarningCircle class="fail-icon" :size="12" aria-hidden="true" />
      <span>{{ failLine.text }}</span>
    </p>

    <button
      v-if="showButton"
      type="button"
      class="btn travel-button"
      :class="detail.action.primary ? 'btn-primary' : 'btn-secondary'"
      :aria-label="detail.action.ariaLabel"
      :title="detail.action.title"
      :aria-disabled="detail.action.disabled ? 'true' : undefined"
      :aria-describedby="describedBy"
      :aria-busy="pending ? 'true' : undefined"
      @click="onAction"
    >
      <component :is="ACTION_ICONS[detail.action.icon ?? 'signpost']" :size="16" aria-hidden="true" />
      <span class="travel-label">{{ detail.action.label }}</span>
      <span v-if="detail.action.timeText !== null" class="travel-time" aria-hidden="true">{{ ` ${detail.action.timeText}` }}</span>
    </button>
    <p v-if="detail.action.note !== ''" class="note">{{ detail.action.note }}</p>

    <button
      type="button"
      class="btn btn-ghost details-toggle"
      :aria-expanded="detailsOpen ? 'true' : 'false'"
      :aria-controls="detailsOpen ? `${uid}-details` : undefined"
      @click="detailsOpen = !detailsOpen"
    >
      <span>Details</span>
      <PhCaretDown class="caret" :class="{ open: detailsOpen }" :size="16" aria-hidden="true" />
    </button>
    <div v-if="detailsOpen" :id="`${uid}-details`" class="details">
      <p v-if="detail.description !== null" class="description">{{ detail.description }}</p>
      <p v-if="detail.descriptionExtra !== null" class="description-extra">{{ detail.descriptionExtra }}</p>
      <dl v-if="detail.trip.services !== null || detail.trip.players !== null" class="facts">
        <template v-if="detail.trip.services !== null">
          <dt>Services</dt>
          <dd class="facts-services">
            <template v-if="detail.trip.services.text !== null">{{ detail.trip.services.text }}</template>
            <template v-else>
              <span v-for="item in detail.trip.services.items" :key="item" class="service">
                <component :is="SERVICE_ICONS[item]" :size="12" aria-hidden="true" />{{ item }}
              </span>
            </template>
          </dd>
        </template>
        <template v-if="detail.trip.players !== null">
          <dt>Players</dt>
          <dd class="facts-players">{{ detail.trip.players }}</dd>
        </template>
      </dl>
      <ul v-if="detail.quests.length > 0" class="quests">
        <li v-for="quest in detail.quests" :key="quest.key" class="card quest">
          <span class="card-kicker">Quest</span>
          <span class="quest-name">{{ quest.name }} · {{ quest.progress }}</span>
          <span class="quest-role">{{ quest.role }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.dock {
  flex: none;
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 8px;
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
  font-size: 12px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}

.head {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.dock-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.dock-name:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.dock-region {
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.tags {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tags .tag {
  gap: 4px;
  padding: 0 8px;
  font-size: 10px;
}

.crossing {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  background: var(--color-accent-900);
  box-shadow: inset 0 0 0 1px var(--color-accent-700);
  color: var(--color-accent-200);
}

.crossing-icon {
  flex: none;
}

.crossing-line {
  min-width: 0;
  overflow-wrap: anywhere;
}

.trip-line,
.route-note,
.note {
  margin: 0;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.note {
  color: var(--color-neutral-500);
}

.tone-text {
  color: var(--color-text);
}

.tone-wait {
  color: var(--color-stamina);
}

.fail-line {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin: 0;
  overflow-wrap: anywhere;
}

.fail-line.wait {
  color: var(--color-stamina);
}

.fail-line.bad {
  color: var(--color-con-red);
}

.fail-icon {
  flex: none;
  margin-top: 4px;
}

.travel-button {
  width: 100%;
  min-height: 48px;
}

.travel-button[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}

.travel-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.travel-time {
  flex: none;
}

.details-toggle {
  width: 100%;
  min-height: 44px;
  justify-content: space-between;
  color: var(--color-neutral-300);
}

.caret {
  flex: none;
}

.caret.open {
  transform: rotate(180deg);
}

/* The expanded parts scroll inside the dock; the Travel button above stays in view. */
.details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 45dvh;
  overflow-y: auto;
}

.description {
  margin: 0;
  font-size: 14px;
  color: var(--color-neutral-300);
  overflow-wrap: anywhere;
}

.description-extra {
  margin: 0;
  color: var(--color-neutral-500);
  overflow-wrap: anywhere;
}

.facts {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 16px;
  row-gap: 8px;
  margin: 0;
}

.facts dt {
  color: var(--color-neutral-400);
}

.facts dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.service {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: 8px;
}

.quests {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quest {
  gap: 4px;
  padding: 8px;
  background: var(--color-bg);
}

.quest-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.quest-role {
  color: var(--color-neutral-500);
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
