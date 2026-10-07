<script setup lang="ts">
import { computed, nextTick, useId, useTemplateRef } from 'vue';
import type { Component } from 'vue';
import {
  PhArrowBendUpRight,
  PhArrowRight,
  PhCaretRight,
  PhCastleTurret,
  PhCheckCircle,
  PhDoorOpen,
  PhHammer,
  PhHourglassMedium,
  PhQuestion,
  PhShieldCheck,
  PhSignpost,
  PhStorefront,
  PhSword,
  PhVault,
  PhXCircle,
} from '@phosphor-icons/vue';
import NoticeLine from '../ledger/NoticeLine.vue';
import type { DetailTag, TravelAction } from './detailModel';
import { aboutMinutes, formatClock } from './travelTimer';
import type { Destination } from './useDestination';

// The destination detail column (51-UI-SPEC "Destination detail", "Checklist" and "Travel button").
// The body scrolls; the one Travel button and its note are docked below it, so Travel never scrolls
// away. Everything shown is what DetailView says (detailModel.ts): this component decides nothing.
// The button predicts; move_character re-checks every trip and its refusal shows in the notice line
// at the bottom of the column. Every string is a text node or a bound attribute.
const props = defineProps<{ destination: Destination }>();

const uid = useId();
const title = useTemplateRef<HTMLElement>('title');

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

const CHECK_ICONS = { ok: PhCheckCircle, wait: PhHourglassMedium, bad: PhXCircle } as const;

/** Splits a line around its clock so the time can be aria-hidden; no clock leaves the text whole. */
function aroundClock(text: string, clock: string | null): { before: string; after: string } | null {
  if (clock === null) return null;
  const at = text.indexOf(clock);
  if (at < 0) return null;
  return { before: text.slice(0, at), after: text.slice(at + clock.length) };
}

function checkClock(secondsLeft: number | null): string | null {
  return secondsLeft === null ? null : formatClock(secondsLeft);
}

const describedBy = computed(() => {
  const action = detail.value?.action;
  if (!action || action.describedBy === null) return undefined;
  return `${uid}-check-${action.describedBy}`;
});

// 'Blocked · {m:ss} left' is hidden as a whole while its minute sentence speaks for it.
const regionTravel = computed(() => detail.value?.trip.regionTravel ?? null);

const showFooter = computed(() => {
  const action = detail.value?.action;
  return action !== undefined && (action.kind !== 'none' || action.note !== '');
});

function focusTitle(): void {
  title.value?.focus();
}

async function onAction(): Promise<void> {
  const action = detail.value?.action;
  if (!action) return;
  if (action.kind === 'firstStop') {
    if (props.destination.selectFirstStop() !== null) {
      await nextTick();
      focusTitle();
    }
    return;
  }
  if (action.disabled || pending.value) return;
  // No event: the call resolving says nothing about the trip (a refusal resolves too). Arrival is
  // read from the character row by the Map screen.
  await props.destination.travel();
}

defineExpose({ focusTitle });
</script>

<template>
  <div class="detail">
    <template v-if="detail">
      <div class="body">
        <span class="card-kicker kicker">{{ detail.kicker }}</span>
        <h4 ref="title" class="title" tabindex="-1">{{ detail.title }}</h4>
        <p class="region-line">{{ detail.regionLine }}</p>

        <ul class="tags">
          <li v-for="tag in detail.tags" :key="tag.key" class="tag tag-neutral" :style="{ color: tag.color ?? undefined }">
            <component :is="tagIcon(tag)" :size="12" aria-hidden="true" />
            <span>{{ tag.text }}</span>
          </li>
        </ul>

        <div v-if="detail.crossing" class="crossing">
          <PhDoorOpen class="crossing-icon" :size="20" aria-hidden="true" />
          <div class="crossing-text">
            <span class="crossing-title">Region crossing</span>
            <span class="crossing-line">
              <span>{{ detail.crossing.from }}</span>
              <PhArrowRight :size="12" aria-hidden="true" />
              <span class="sr-only">to</span>
              <span>{{ detail.crossing.to }}</span>
              <span> · </span>
              <span :style="{ color: detail.crossing.levelColor }">{{ detail.crossing.levelText }}</span>
            </span>
          </div>
        </div>

        <p v-if="detail.description !== null" class="description">{{ detail.description }}</p>
        <p v-if="detail.descriptionExtra !== null" class="description-extra">{{ detail.descriptionExtra }}</p>

        <dl
          v-if="detail.trip.stamina !== null || regionTravel || detail.trip.services !== null || detail.trip.players !== null"
          class="trip"
        >
          <template v-if="detail.trip.stamina !== null">
            <dt>Stamina</dt>
            <dd class="trip-stamina">{{ detail.trip.stamina }}</dd>
          </template>
          <template v-if="regionTravel">
            <dt>Region travel</dt>
            <dd class="trip-region" :class="`tone-${regionTravel.tone}`">
              <template v-if="regionTravel.srText !== null"
                ><span aria-hidden="true">{{ regionTravel.text }}</span
                ><span class="sr-only">{{ regionTravel.srText }}</span></template
              >
              <template v-else>{{ regionTravel.text }}</template>
            </dd>
          </template>
          <template v-if="detail.trip.services !== null">
            <dt>Services</dt>
            <dd class="trip-services">
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
            <dd class="trip-players">{{ detail.trip.players }}</dd>
          </template>
        </dl>

        <ul v-if="detail.quests.length > 0" class="quests">
          <li v-for="quest in detail.quests" :key="quest.key" class="card quest">
            <span class="card-kicker">Quest</span>
            <span class="quest-name" :title="`${quest.name} · ${quest.progress}`">{{ quest.name }} · {{ quest.progress }}</span>
            <span class="quest-role">{{ quest.role }}</span>
          </li>
        </ul>

        <section v-if="detail.route" class="route">
          <h6>Not directly connected · route</h6>
          <ol class="chain">
            <li
              v-for="(step, index) in detail.route.steps"
              :key="String(step.id)"
              class="step"
              :class="{
                origin: index === 0,
                target: index === detail.route.steps.length - 1,
              }"
            >
              <span v-if="index > 0" class="joiner" :class="{ crossing: step.crossingInto !== null }">
                <PhDoorOpen v-if="step.crossingInto !== null" :size="12" aria-hidden="true" />
                <PhCaretRight v-else :size="12" aria-hidden="true" />
                <span v-if="step.crossingInto !== null" class="sr-only">, then crossing into {{ step.crossingInto }},</span>
              </span>
              <span class="step-name">{{ step.name }}</span>
            </li>
          </ol>
          <p class="route-note">{{ detail.route.note }}</p>
        </section>

        <section v-if="detail.checks" class="checklist">
          <h6>Can you go?</h6>
          <ul class="checks">
            <li
              v-for="check in detail.checks"
              :id="`${uid}-check-${check.key}`"
              :key="check.key"
              class="check"
              :class="`check-${check.status}`"
              :data-check="check.key"
            >
              <component :is="CHECK_ICONS[check.status]" class="check-icon" :size="16" aria-hidden="true" />
              <span class="check-text">
                <span class="check-label">{{ check.label }}</span>
                <span v-if="check.detail !== ''" class="check-detail">
                  <template v-if="aroundClock(check.detail, checkClock(check.secondsLeft))">
                    {{ aroundClock(check.detail, checkClock(check.secondsLeft))!.before
                    }}<span aria-hidden="true">{{ checkClock(check.secondsLeft) }}</span
                    ><span class="sr-only">{{ aboutMinutes(check.secondsLeft ?? 0) }}</span
                    >{{ aroundClock(check.detail, checkClock(check.secondsLeft))!.after }}
                  </template>
                  <template v-else>{{ check.detail }}</template>
                </span>
              </span>
            </li>
          </ul>
        </section>
      </div>

      <div v-if="showFooter" class="footer">
        <button
          v-if="detail.action.kind !== 'none'"
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
      </div>
    </template>
    <NoticeLine :rejection="props.destination.runner.rejection.value" />
  </div>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  font-size: 12px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding-bottom: 8px;
}

.footer {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
}

.kicker {
  display: block;
}

.title {
  margin: 0;
  overflow-wrap: anywhere;
}

.region-line {
  margin: 0;
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
}

.crossing-icon {
  flex: none;
  color: var(--color-accent-200);
}

.crossing-text {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}

.crossing-title {
  font-weight: 500;
  color: var(--color-accent-100);
}

.crossing-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 4px;
  color: var(--color-accent-200);
  overflow-wrap: anywhere;
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

.trip {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 16px;
  row-gap: 8px;
  margin: 0;
}

.trip dt {
  color: var(--color-neutral-400);
}

.trip dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.tone-neutral {
  color: var(--color-neutral-400);
}

.tone-text {
  color: var(--color-text);
}

.tone-wait {
  color: var(--color-stamina);
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quest-role {
  color: var(--color-neutral-500);
}

.route {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.route h6,
.checklist h6 {
  margin: 0;
}

.chain {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.step {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-neutral-200);
}

.step.origin {
  color: var(--color-neutral-400);
}

.step.target {
  color: var(--color-accent-200);
}

.step-name {
  overflow-wrap: anywhere;
}

.joiner {
  display: inline-flex;
  color: var(--color-neutral-500);
}

.joiner.crossing {
  color: var(--color-accent);
}

.route-note {
  margin: 0;
  color: var(--color-neutral-500);
}

.checklist {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checks {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border-radius: var(--radius-md);
  background: var(--color-bg);
}

.check-icon {
  flex: none;
}

.check-ok .check-icon {
  color: var(--color-con-light-green);
}

.check-wait .check-icon {
  color: var(--color-stamina);
}

.check-bad .check-icon {
  color: var(--color-con-red);
}

.check-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.check-label {
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.check-detail {
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.travel-button {
  width: 100%;
  min-height: 40px;
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

.note {
  margin: 0;
  color: var(--color-neutral-500);
  overflow-wrap: anywhere;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* The mobile dock reuses this button (plan 51-11): 48px for the primary action, 44px for the rest. */
@media (max-width: 899px) {
  .travel-button {
    min-height: 44px;
  }

  .travel-button.btn-primary {
    min-height: 48px;
  }
}
</style>
