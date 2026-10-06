<script setup lang="ts">
import { computed } from 'vue';
import {
  PhGlobeHemisphereWest,
  PhHourglassMedium,
  PhUsersThree,
  PhWarning,
  PhWarningCircle,
  PhWaveform,
} from '@phosphor-icons/vue';
import type { FeedLineView } from './lines';
import type { KeywordEntry, KeywordPart } from './keywords';
import { keywordActionLabel } from './keywordLabel';
import { splitLastInteger } from '../combat/emphasis';

// One labelled feed line (47-UI-SPEC "Line kinds", "Keywords"). Every string is a text node,
// with no raw HTML, no markup interpretation and no color tokens (T-47-01). Keyword buttons come only from
// `parts` that lines.ts builds for eligible kinds (T-47-06).
const props = defineProps<{ line: FeedLineView; disabled: boolean; currentRound?: boolean }>();
const emit = defineEmits<{ keyword: [entry: KeywordEntry] }>();

const bodyParts = computed<KeywordPart[]>(() => props.line.parts ?? [{ text: props.line.text, entry: null }]);
const titleParts = computed<KeywordPart[]>(() =>
  props.line.title === null ? [] : (props.line.titleParts ?? [{ text: props.line.title, entry: null }]),
);

// Round dividers and wind-up warnings are client-made system copy (48-UI-SPEC "Feed Contract").
const roundLabel = computed(() =>
  props.line.roundNumber !== null && props.line.roundNumber !== undefined
    ? `Round ${props.line.roundNumber}`
    : props.line.text,
);

// Damage and heal lines emphasise the last standalone integer. The three pieces are plain
// strings rendered as text nodes, so markup in a server line stays literal (T-48-24).
const amountSplit = computed(() =>
  props.line.kind === 'damage' || props.line.kind === 'heal' ? splitLastInteger(props.line.text) : null,
);

// Whisper lines and NPC speech with a known speaker are wrapped in typographic quotes.
const quoted = computed(() => {
  const { kind, speaker } = props.line;
  return speaker !== null && (kind === 'npc' || kind === 'whisper' || kind === 'party');
});

function press(entry: KeywordEntry): void {
  if (props.disabled) return;
  emit('keyword', entry);
}

function disabledAttr(): 'true' | undefined {
  return props.disabled ? 'true' : undefined;
}
</script>

<template>
  <div v-if="line.kind === 'round'" class="line line-round" :class="{ current: currentRound === true }">
    <span class="rule rule-left" aria-hidden="true"></span>
    <span class="round-label">{{ roundLabel }}</span>
    <span class="rule rule-right" aria-hidden="true"></span>
  </div>
  <div v-else-if="line.kind === 'windup' && line.windup" class="line line-windup">
    <PhWarning class="icon-windup" :size="16" aria-hidden="true" />
    <span class="body">{{ line.windup.lead }}<span class="ability">{{ line.windup.ability }}</span>{{ line.windup.tail }}</span>
  </div>
  <div
    v-else
    class="line"
    :class="[`line-${line.kind}`, { 'line-plain': line.speaker === null, 'line-player-text': line.playerAuthored === true }]"
  >
    <span
      v-if="line.kind === 'keeper'"
      class="micro"
      :aria-label="line.roundTag != null ? `The Keeper, about round ${line.roundTag}` : undefined"
    >{{ line.label }}<span v-if="line.roundTag != null" class="round-tag">{{ ` · Round ${line.roundTag}` }}</span></span>
    <span v-else-if="line.kind === 'quest'" class="micro micro-inline">{{ line.label }}</span>
    <span v-else-if="line.kind === 'world'" class="micro micro-inline">
      <PhWaveform :size="12" aria-hidden="true" /><span>{{ line.label }}</span>
    </span>
    <span v-else-if="line.kind === 'worldEvent'" class="micro micro-inline">
      <PhGlobeHemisphereWest :size="12" aria-hidden="true" /><span>{{ line.label }}</span>
    </span>
    <template v-else-if="line.kind === 'party'">
      <PhUsersThree class="icon icon-party" :size="12" aria-hidden="true" />
      <span class="sr-only">Party</span>
    </template>
    <PhWarningCircle
      v-else-if="line.kind === 'warning' || line.kind === 'error'"
      class="icon"
      :class="line.kind === 'warning' ? 'icon-warning' : 'icon-error'"
      :size="14"
      aria-hidden="true"
    />
    <span v-else-if="line.kind === 'scene' && line.title !== null" class="title">
      <template v-for="(part, i) in titleParts" :key="i"><button
          v-if="part.entry"
          type="button"
          class="keyword"
          :title="keywordActionLabel(part.entry)"
          :aria-label="keywordActionLabel(part.entry)"
          :aria-disabled="disabledAttr()"
          @click="press(part.entry)"
        >{{ part.text }}</button><template v-else>{{ part.text }}</template></template>
    </span>

    <span class="body">
      <template v-if="line.kind === 'npc' && line.speaker !== null"><button
          v-if="line.speakerKeyword"
          type="button"
          class="keyword who"
          :title="keywordActionLabel(line.speakerKeyword)"
          :aria-label="keywordActionLabel(line.speakerKeyword)"
          :aria-disabled="disabledAttr()"
          @click="press(line.speakerKeyword)"
        >{{ line.speaker }}</button><span v-else class="who">{{ line.speaker }}</span><span>{{ ' says, ' }}</span></template>
      <template v-else-if="line.kind === 'whisper' && line.speaker !== null">
        <template v-if="line.direction === 'sent'"><span>{{ 'You whisper to ' }}</span><span class="who">{{ line.speaker }}</span><span>{{ ', ' }}</span></template>
        <template v-else><span class="who">{{ line.speaker }}</span><span>{{ ' whispers, ' }}</span></template>
      </template>
      <template v-else-if="line.kind === 'party' && line.speaker !== null"><span class="who">{{ line.speaker }}</span><span>{{ ' says, ' }}</span></template>
      <template v-else-if="line.kind === 'echo'"><span>{{ '› ' }}</span></template>
      <template v-if="amountSplit">{{ amountSplit.before }}<span class="amount">{{ amountSplit.amount }}</span>{{ amountSplit.after }}</template>
      <template v-if="quoted"><span>{{ '“' }}</span></template><template v-for="(part, i) in amountSplit ? [] : bodyParts" :key="i"><button
          v-if="part.entry"
          type="button"
          class="keyword"
          :title="keywordActionLabel(part.entry)"
          :aria-label="keywordActionLabel(part.entry)"
          :aria-disabled="disabledAttr()"
          @click="press(part.entry)"
        >{{ part.text }}</button><template v-else>{{ part.text }}</template></template><template v-if="quoted"><span>{{ '”' }}</span></template>
    </span>

    <span v-if="line.kind === 'echo' && line.queued" class="queued">
      <PhHourglassMedium :size="12" aria-hidden="true" /><span>Queued</span>
    </span>
  </div>
</template>

<style scoped>
.line {
  min-width: 0;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.6;
  overflow-wrap: anywhere;
  color: var(--color-neutral-300);
}

.body {
  min-width: 0;
  white-space: pre-wrap;
}

/* Player-typed text keeps normal wrapping so a typed newline cannot draw a fake second line.
   line-player-text marks player text that fell back to a server-looking kind. */
.line-echo .body,
.line-say .body,
.line-whisper .body,
.line-party .body,
.line-player-text .body {
  white-space: normal;
}

.micro {
  font-size: 10px;
  line-height: 1.5;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-accent);
}

.micro-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: 8px;
}

.icon {
  flex: none;
  margin-top: 4px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Keeper narration: label over italic accent-200 text. */
.line-keeper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.line-keeper .body {
  font-style: italic;
  color: var(--color-accent-200);
}

/* NPC speech and whispers: hued name, neutral text. */
.line-npc .who {
  font-weight: 500;
  color: var(--color-line-npc);
}

.line-whisper .who {
  font-weight: 500;
  color: var(--color-line-whisper);
}

/* An unparsed whisper or speakerless NPC line reads whole in its hue. */
.line-whisper.line-plain .body {
  color: var(--color-line-whisper);
}

.line-npc.line-plain .body {
  color: var(--color-line-npc);
}

.line-party {
  display: flex;
  gap: 4px;
}

.line-party .icon-party {
  color: var(--color-neutral-500);
}

.line-party .who {
  color: var(--color-neutral-400);
}

.line-party .body,
.line-say {
  color: var(--color-text);
}

.line-system {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.line-warning,
.line-error {
  display: flex;
  gap: 8px;
}

.line-warning {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.icon-warning {
  color: var(--color-con-orange);
}

.icon-error {
  color: var(--color-health);
}

.line-error {
  color: var(--color-neutral-200);
}

.line-quest {
  color: var(--color-line-quest);
}

.line-quest .micro {
  color: var(--color-line-quest);
}

.line-world,
.line-worldEvent {
  padding: 8px 16px;
  border-radius: var(--radius-md);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--color-accent-800) 55%, transparent),
    transparent 80%
  );
  color: var(--color-accent-300);
}

.line-world .body {
  white-space: pre-wrap;
}

.line-scene {
  display: flex;
  flex-direction: column;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--color-surface) 90%, transparent),
    transparent 85%
  );
  color: var(--color-neutral-200);
}

.line-scene .title {
  margin-bottom: 4px;
  font-weight: 500;
  color: var(--color-text);
}

.line-scene .body {
  white-space: pre-wrap;
}

.line-echo {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.queued {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  font-size: 10px;
  color: var(--color-neutral-500);
}

/* Combat lines are Body 14 / 400 neutral (the base .line); only the amount is emphasised. */
.line-damage .amount {
  font-weight: 500;
  color: var(--color-con-red);
}

.line-heal .amount {
  font-weight: 500;
  color: var(--color-con-light-green);
}

/* Round divider: a Micro label between two fading rules; the open round is accent. */
.line-round {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 8px 0 0;
  font-size: 10px;
  line-height: 1.5;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-variant-numeric: tabular-nums;
  color: var(--color-neutral-400);
}

.line-round .rule {
  flex: 1;
  height: 1px;
}

.line-round .rule-left {
  background: linear-gradient(to left, var(--color-divider), transparent);
}

.line-round .rule-right {
  background: linear-gradient(to right, var(--color-divider), transparent);
}

.line-round.current {
  color: var(--color-accent);
}

.line-round.current .rule-left {
  background: linear-gradient(to left, var(--color-accent-700), transparent);
}

.line-round.current .rule-right {
  background: linear-gradient(to right, var(--color-accent-700), transparent);
}

/* Wind-up warning block. */
.line-windup {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-neutral-200);
}

.icon-windup {
  flex: none;
  color: var(--color-con-orange);
}

.line-windup .ability {
  font-weight: 500;
  color: var(--color-text);
}

/* Late narration: the round it describes, after the Keeper label. */
.round-tag {
  color: var(--color-neutral-500);
}

/* Keywords (47-UI-SPEC "Keywords"; underline offset rounded to the 4px grid by the checker note). */
.keyword {
  display: inline;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--color-accent-300);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--color-accent) 45%, transparent);
  text-underline-offset: 4px;
  cursor: pointer;
  overflow-wrap: anywhere;
  text-align: inherit;
}

.keyword:hover {
  color: var(--color-accent-200);
  text-decoration-color: var(--color-accent);
}

.keyword:active {
  color: var(--color-accent-100);
}

.keyword:focus-visible {
  outline-offset: 2px;
}

.keyword[aria-disabled='true'] {
  cursor: default;
}

/* An NPC speaker keyword keeps the NPC hue and underlines on hover and focus only. */
.line-npc .keyword.who {
  color: var(--color-line-npc);
  font-weight: 500;
  text-decoration: none;
}

.line-npc .keyword.who:hover,
.line-npc .keyword.who:focus-visible {
  text-decoration: underline;
  text-decoration-color: var(--color-line-npc);
  text-underline-offset: 4px;
}
</style>
