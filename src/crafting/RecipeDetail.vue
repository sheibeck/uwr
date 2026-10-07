<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue';
import { PhHammer, PhMinus, PhPlus, PhPlusCircle, PhSealCheck, PhX } from '@phosphor-icons/vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { ActionRunner } from '../ledger/actionRunner';
import { rarityColor } from '../ledger/itemModel';
import ItemCard from './ItemCard.vue';
import ReagentPicker from './ReagentPicker.vue';
import {
  bagCount,
  craftAvailability,
  craftCountArgs,
  craftQuantity,
  createsCard,
  essenceKeyOf,
  essenceMagnitudeText,
  essenceOptions,
  reagentEffectText,
  reagentOptions,
  recipeDetail,
  stationHere,
  usesRows,
} from './craftingModel';
import type { CraftCountArgs, QuantityState } from './craftingModel';

// The selected recipe (mock 9a, with the owner decisions that replace the odds bar and add the
// output details): top to bottom the Creates card (what the output is and does), the Uses rows
// (have / need for the chosen quantity), for a gear recipe the single deterministic quality line with
// the hint that would raise it, the one essence-and-reagent slot that opens the essence slot, the
// reagent slots and the inline picker in place, the reason line and the quantity row (minus, the
// shown value, plus, Max and Craft). One Craft sends the whole batch through craft_recipe_count; the
// server re-checks every batch (plan 50-29) and the client only clamps to what the bag allows. Every
// verdict (materials, essence, reagents, bag room) is the shared planCraft through the model, so the
// client shows what the server will decide. Recipe, output, material and reagent names are server text and only reach the
// page as text nodes.
const props = defineProps<{
  recipeId: bigint;
  runner: ActionRunner;
  mobile: boolean;
}>();
// Craft again (plan 50-37) repeats the arguments of the last craft the screen saw start.
const emit = defineEmits<{ 'craft-start': [{ args: CraftCountArgs }] }>();

const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

const offline = computed(() => !game.connected.value || ledger.reducers.value === null);
const character = computed(() => game.character.value);
const station = computed(() => stationHere(character.value?.locationId, game.locations.value));

const recipe = computed(() => ledger.recipes.value.get(props.recipeId) ?? null);
const detail = computed(() => {
  const c = character.value;
  return c ? recipeDetail(
    { recipes: ledger.recipes.value, templates: ledger.templates.value, items: ledger.items.value },
    props.recipeId,
    c.level,
  ) : null;
});

// What the output is and does; null while the output template has not arrived (the name and meta
// line stand in).
const card = computed(() => {
  const r = recipe.value;
  const c = character.value;
  if (!r || !c) return null;
  return createsCard(
    r,
    ledger.templates.value,
    c,
    game.renownPerks.value.map((perk) => perk.perkKey),
  );
});

// --- how many to craft ---
const requested = ref(1n);
const NO_QUANTITY: QuantityState = {
  quantity: 1n,
  max: 0n,
  made: 1n,
  canDecrease: false,
  canIncrease: false,
  maxLabel: 'Max 0',
  craftLabel: 'Missing materials',
  forQtyText: '',
  craftAriaLabel: 'Missing materials',
};

// --- the chosen essence and reagents (slot order; null is an empty slot) ---
const essenceId = ref<bigint | null>(null);
const reagentIds = ref<Array<bigint | null>>([]);
type PickerState = { kind: 'essence' } | { kind: 'reagent'; index: number } | null;
const picker = ref<PickerState>(null);
// The single essence-and-reagent slot: collapsed until opened, and kept open while choosing.
const expanded = ref(false);

const slotButtons = new Map<string, HTMLElement>();
function setSlotButton(key: string, el: unknown): void {
  if (el instanceof HTMLElement) slotButtons.set(key, el);
  else slotButtons.delete(key);
}
function focusSlot(key: string): void {
  void nextTick(() => slotButtons.get(key)?.focus());
}

function resetChoices(): void {
  essenceId.value = null;
  reagentIds.value = [];
  picker.value = null;
}
watch(() => props.recipeId, () => {
  resetChoices();
  expanded.value = false;
  requested.value = 1n;
});

const templateOf = (id: bigint | null) => (id === null ? undefined : ledger.templates.value.get(id));
const essenceTemplate = computed(() => templateOf(essenceId.value));
const essenceKey = computed(() => essenceKeyOf(essenceTemplate.value));

// After a craft the choices stay, except the ones whose items are used up: an essence that is gone
// clears the reagent slots with it, and a reagent chosen more often than it is on hand loses the
// extra slots.
watch(
  () => ledger.items.value,
  (items) => {
    const essence = essenceId.value;
    if (essence !== null && bagCount(items, essence) < 1n) {
      resetChoices();
      return;
    }
    const used = new Map<bigint, bigint>();
    let changed = false;
    const next = reagentIds.value.map((id) => {
      if (id === null) return null;
      const taken = (used.get(id) ?? 0n) + 1n;
      used.set(id, taken);
      if (taken > bagCount(items, id)) {
        changed = true;
        return null;
      }
      return id;
    });
    if (changed) reagentIds.value = next;
  },
);

// The stepper state: the maximum is the server's maxCraftCount for the chosen essence and reagents,
// bounded by the backpack room of the hub's item rows (the same craftBatchFits gate the reducer runs).
const qty = computed<QuantityState>(() => {
  const r = recipe.value;
  if (!r) return NO_QUANTITY;
  return craftQuantity(
    {
      recipe: r,
      station: station.value,
      templates: ledger.templates.value,
      items: ledger.items.value,
      choice: { essenceId: essenceId.value, reagentIds: reagentIds.value },
    },
    requested.value,
  );
});
// The request follows the live rows: a quantity above what the bag now allows steps down.
watch(
  () => qty.value.quantity,
  (quantity) => {
    if (quantity !== requested.value) requested.value = quantity;
  },
);

const uses = computed(() => {
  const r = recipe.value;
  return r ? usesRows(r, ledger.templates.value, ledger.items.value, qty.value.quantity) : [];
});

const availability = computed(() => {
  const r = recipe.value;
  if (!r) return null;
  return craftAvailability({
    recipe: r,
    station: station.value,
    templates: ledger.templates.value,
    items: ledger.items.value,
    choice: { essenceId: essenceId.value, reagentIds: reagentIds.value },
    count: qty.value.quantity,
  });
});

const REASON_ID = computed(() => `craft-reason-${props.mobile ? 'mobile' : 'desktop'}`);
const REGION_ID = computed(() => `craft-reagents-${props.mobile ? 'mobile' : 'desktop'}`);
const reason = computed(() => availability.value?.reason ?? null);
const craftPending = computed(() => props.runner.isPending('craft'));
const craftInert = computed(
  () =>
    offline.value ||
    craftPending.value ||
    availability.value === null ||
    !availability.value.available ||
    qty.value.max === 0n,
);

const essenceOpts = computed(() =>
  detail.value && detail.value.qualityKey !== null
    ? essenceOptions(ledger.items.value, ledger.templates.value, detail.value.qualityKey)
    : [],
);
const reagentOpts = computed(() => {
  const state = picker.value;
  if (state === null || state.kind !== 'reagent') return [];
  return reagentOptions(
    ledger.items.value,
    ledger.templates.value,
    essenceKey.value,
    reagentIds.value,
    state.index,
  );
});

const slotsDisabled = computed(() => !station.value);

const chosenReagents = computed(() => reagentIds.value.filter((id) => id !== null).length);
const toggleLabel = computed(() =>
  essenceId.value === null
    ? 'Add Essence + reagent'
    : `${reagentName(essenceId.value)} + ${chosenReagents.value} ${chosenReagents.value === 1 ? 'reagent' : 'reagents'}`,
);

const toggleButton = ref<HTMLElement | null>(null);
function toggleSlots(): void {
  if (slotsDisabled.value) return;
  if (expanded.value) {
    expanded.value = false;
    picker.value = null;
    void nextTick(() => toggleButton.value?.focus());
    return;
  }
  expanded.value = true;
}

function toggleEssencePicker(): void {
  if (slotsDisabled.value) return;
  const open = picker.value !== null && picker.value.kind === 'essence';
  picker.value = open ? null : { kind: 'essence' };
}

function toggleReagentPicker(index: number): void {
  if (slotsDisabled.value) return;
  const open = picker.value !== null && picker.value.kind === 'reagent' && picker.value.index === index;
  picker.value = open ? null : { kind: 'reagent', index };
}

function chooseEssence(templateId: bigint): void {
  const slots = detail.value?.slots ?? 0;
  if (essenceId.value !== templateId) {
    essenceId.value = templateId;
    reagentIds.value = new Array<bigint | null>(slots).fill(null);
  }
  picker.value = null;
  focusSlot('essence');
}

function removeEssence(): void {
  resetChoices();
  focusSlot('essence');
}

function chooseReagent(templateId: bigint): void {
  const state = picker.value;
  if (state === null || state.kind !== 'reagent') return;
  const next = reagentIds.value.slice();
  next[state.index] = templateId;
  reagentIds.value = next;
  picker.value = null;
  focusSlot(`reagent-${state.index}`);
}

function removeReagent(index: number): void {
  const next = reagentIds.value.slice();
  next[index] = null;
  reagentIds.value = next;
  if (picker.value !== null) picker.value = null;
  focusSlot(`reagent-${index}`);
}

function closePicker(): void {
  const state = picker.value;
  picker.value = null;
  if (state === null) return;
  focusSlot(state.kind === 'essence' ? 'essence' : `reagent-${state.index}`);
}

// The stepper bounds are aria-disabled, not disabled, so focus never drops to the page at a bound.
function dec(): void {
  if (qty.value.canDecrease) requested.value = qty.value.quantity - 1n;
}

function inc(): void {
  if (qty.value.canIncrease) requested.value = qty.value.quantity + 1n;
}

function setMax(): void {
  if (qty.value.canIncrease) requested.value = qty.value.max;
}

async function onCraft(): Promise<void> {
  const reducers = ledger.reducers.value;
  const c = character.value;
  if (!reducers || !c || craftInert.value) return;
  const args = craftCountArgs(
    c.id,
    props.recipeId,
    { essenceId: essenceId.value, reagentIds: reagentIds.value },
    qty.value.quantity,
  );
  emit('craft-start', { args });
  const ok = await props.runner.run('craft', () => reducers.craftRecipeCount(args));
  if (ok) requested.value = 1n;
}

function reagentName(id: bigint | null): string {
  const template = templateOf(id);
  return template ? template.name : '';
}

function reagentColor(id: bigint | null): string | undefined {
  const template = templateOf(id);
  if (!template) return undefined;
  const rarity = typeof template.rarity === 'string' ? template.rarity.toLowerCase() : 'common';
  return rarity === 'common' || rarity === '' ? 'var(--color-text)' : rarityColor(rarity);
}
</script>

<template>
  <section class="recipe-detail" :class="{ mobile: props.mobile }" aria-label="Recipe details">
    <template v-if="detail">
      <div class="detail-body">
        <ItemCard
          v-if="card"
          :kicker="props.mobile ? '' : 'Creates'"
          :name="card.name"
          :color="card.color"
          :icon="card.icon"
          :yield-tag="card.yieldTag"
          :details="card.details"
          :mobile="props.mobile"
        />
        <template v-else>
          <h4 class="title">{{ detail.name }}</h4>
          <p v-if="detail.metaParts.length > 0" class="meta">
            <template v-for="(part, index) in detail.metaParts" :key="index">
              <span v-if="index > 0" aria-hidden="true"> · </span>
              <span class="meta-part" :class="{ short: part.tone === 'short' }">{{ part.text }}</span>
            </template>
          </p>
        </template>

        <section class="uses-section">
          <div class="uses-head">
            <h6>Uses</h6>
            <span v-if="qty.forQtyText" class="for-qty">{{ qty.forQtyText }}</span>
          </div>
          <ul class="uses">
            <li v-for="row in uses" :key="String(row.templateId)" class="use-row">
              <component :is="row.icon" :size="14" class="use-icon" aria-hidden="true" />
              <span class="use-name" :style="{ color: row.color }" :title="row.name">{{ row.name }}</span>
              <span class="use-count">
                <span class="have" :class="row.short ? 'short' : 'met'">{{ row.have }}</span>
                <span class="of"> / {{ row.need }}</span>
              </span>
            </li>
          </ul>
        </section>

        <section v-if="detail.gear" class="quality">
          <p v-if="detail.qualityLine" class="quality-line">
            <PhSealCheck :size="16" class="seal" aria-hidden="true" />
            <span>{{ detail.qualityLine }}</span>
          </p>
          <p v-if="detail.qualityHint" class="hint">{{ detail.qualityHint }}</p>
        </section>

        <section v-if="detail.gear" class="reagents">
          <button
            ref="toggleButton"
            type="button"
            class="reagent-toggle"
            :aria-expanded="expanded ? 'true' : 'false'"
            :aria-controls="REGION_ID"
            :aria-disabled="slotsDisabled ? 'true' : undefined"
            :aria-describedby="slotsDisabled && reason ? REASON_ID : undefined"
            @click="toggleSlots"
          >
            <PhPlusCircle :size="16" class="plus" aria-hidden="true" />
            <span class="toggle-label" :style="essenceId !== null ? { color: reagentColor(essenceId) } : undefined">{{ toggleLabel }}</span>
            <span class="toggle-hint">optional · adds an affix</span>
          </button>

          <div v-if="expanded" :id="REGION_ID" class="reagent-region">
            <div class="slot-block">
              <div class="slot" :class="essenceId === null ? 'empty' : 'filled'">
                <button
                  :ref="(el) => setSlotButton('essence', el)"
                  type="button"
                  class="slot-main"
                  :aria-expanded="picker !== null && picker.kind === 'essence' ? 'true' : 'false'"
                  :aria-disabled="slotsDisabled ? 'true' : undefined"
                  @click="toggleEssencePicker"
                >
                  <template v-if="essenceId === null">
                    <PhPlusCircle :size="16" class="plus" aria-hidden="true" />
                    <span class="slot-label">Add essence</span>
                    <span class="slot-right">Unlocks reagents</span>
                  </template>
                  <template v-else>
                    <span class="slot-name" :style="{ color: reagentColor(essenceId) }" :title="reagentName(essenceId)">{{ reagentName(essenceId) }}</span>
                    <span class="slot-right">{{ essenceMagnitudeText(essenceKey) }}</span>
                  </template>
                </button>
                <button
                  v-if="essenceId !== null"
                  type="button"
                  class="btn btn-ghost btn-icon remove"
                  :aria-label="`Remove ${reagentName(essenceId)}`"
                  @click="removeEssence"
                >
                  <PhX :size="14" aria-hidden="true" />
                </button>
              </div>
              <ReagentPicker
                v-if="picker !== null && picker.kind === 'essence'"
                kind="essence"
                :options="essenceOpts"
                :mobile="props.mobile"
                @choose="chooseEssence"
                @close="closePicker"
              />
            </div>

            <template v-if="essenceId !== null && detail.slots > 0">
              <p class="slots-line">{{ detail.slotsLine }}</p>
              <div v-for="(slotId, index) in reagentIds" :key="index" class="slot-block">
                <div class="slot" :class="slotId === null ? 'empty' : 'filled'">
                  <button
                    :ref="(el) => setSlotButton(`reagent-${index}`, el)"
                    type="button"
                    class="slot-main"
                    :aria-expanded="picker !== null && picker.kind === 'reagent' && picker.index === index ? 'true' : 'false'"
                    :aria-disabled="slotsDisabled ? 'true' : undefined"
                    @click="toggleReagentPicker(index)"
                  >
                    <template v-if="slotId === null">
                      <PhPlusCircle :size="16" class="plus" aria-hidden="true" />
                      <span class="slot-label">Add reagent</span>
                      <span class="slot-right">+ affix</span>
                    </template>
                    <template v-else>
                      <span class="slot-name" :style="{ color: reagentColor(slotId) }" :title="reagentName(slotId)">{{ reagentName(slotId) }}</span>
                      <span class="slot-right">{{ reagentEffectText(essenceKey, reagentName(slotId)) }}</span>
                    </template>
                  </button>
                  <button
                    v-if="slotId !== null"
                    type="button"
                    class="btn btn-ghost btn-icon remove"
                    :aria-label="`Remove ${reagentName(slotId)}`"
                    @click="removeReagent(index)"
                  >
                    <PhX :size="14" aria-hidden="true" />
                  </button>
                </div>
                <ReagentPicker
                  v-if="picker !== null && picker.kind === 'reagent' && picker.index === index"
                  kind="reagent"
                  :options="reagentOpts"
                  :mobile="props.mobile"
                  @choose="chooseReagent"
                  @close="closePicker"
                />
              </div>
            </template>
          </div>
        </section>
      </div>

      <div class="detail-dock">
        <p v-if="reason" :id="REASON_ID" class="reason">{{ reason }}</p>
        <div class="qty-row">
          <div class="qty-group" role="group" aria-label="How many to craft">
            <span class="stepper">
              <button
                type="button"
                class="btn btn-ghost btn-icon step-btn"
                aria-label="One fewer"
                :aria-disabled="qty.canDecrease ? undefined : 'true'"
                @click="dec"
              >
                <PhMinus :size="16" aria-hidden="true" />
              </button>
              <output class="qty-value">{{ String(qty.quantity) }}</output>
              <button
                type="button"
                class="btn btn-ghost btn-icon step-btn"
                aria-label="One more"
                :aria-disabled="qty.canIncrease ? undefined : 'true'"
                @click="inc"
              >
                <PhPlus :size="16" aria-hidden="true" />
              </button>
            </span>
            <button
              type="button"
              class="btn btn-ghost max-btn"
              :aria-label="`Set to the most you can make, ${qty.max}`"
              :aria-disabled="qty.canIncrease ? undefined : 'true'"
              @click="setMax"
            >
              {{ qty.maxLabel }}
            </button>
          </div>
          <button
            type="button"
            class="btn btn-primary craft-btn"
            :aria-label="qty.craftAriaLabel"
            :aria-disabled="craftInert ? 'true' : undefined"
            :aria-describedby="reason ? REASON_ID : undefined"
            @click="onCraft"
          >
            <PhHammer :size="16" aria-hidden="true" />
            <span class="craft-text">{{ qty.craftLabel }}</span>
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.recipe-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  height: 100%;
  padding: 16px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-bg) 35%, transparent);
  font-variant-numeric: tabular-nums;
}

.recipe-detail.mobile {
  padding: 0;
  background: transparent;
  border-radius: 0;
}

.detail-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

h4 {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  line-height: 1.12;
  overflow-wrap: anywhere;
}

.meta {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.meta-part.short {
  color: var(--color-con-red);
}

.uses-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.uses-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

h6 {
  margin: 0;
  color: var(--color-neutral-400);
}

.for-qty {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.uses {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.use-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: var(--radius-md);
  background: var(--color-bg);
  font-size: 14px;
  line-height: 1.5;
}

.use-icon {
  flex: none;
  color: var(--color-neutral-400);
}

.use-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.use-count {
  flex: none;
  font-variant-numeric: tabular-nums;
}

.have.met {
  color: var(--color-con-light-green);
}

.have.short {
  color: var(--color-con-red);
}

.of {
  color: var(--color-neutral-500);
}

.quality,
.reagents {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quality-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-300);
  overflow-wrap: anywhere;
}

.seal {
  flex: none;
  color: var(--color-accent);
}

.hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.reagent-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 8px 16px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--color-divider);
  color: var(--color-neutral-400);
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
}

.reagent-toggle:hover {
  background: color-mix(in srgb, var(--color-text) 7%, transparent);
}

.reagent-toggle:active {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}

.reagent-toggle:focus-visible {
  outline-offset: -2px;
}

.reagent-toggle[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}

.mobile .reagent-toggle {
  min-height: 44px;
}

.toggle-label {
  min-width: 0;
  overflow-wrap: anywhere;
}

.toggle-hint {
  flex: 1;
  min-width: 0;
  text-align: right;
  overflow-wrap: anywhere;
}

.reagent-region {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slots-line {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.slot-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slot {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: var(--radius-md);
}

.slot.empty {
  box-shadow: inset 0 0 0 1px var(--color-divider);
}

.slot.filled {
  background: var(--color-bg);
  box-shadow: inset 0 0 0 1px var(--color-accent-700);
}

.slot-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 8px 16px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-neutral-400);
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
}

.slot-main:hover {
  background: color-mix(in srgb, var(--color-text) 7%, transparent);
}

.slot-main:active {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}

.slot-main:focus-visible {
  outline-offset: -2px;
}

.slot-main[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}

.mobile .slot-main {
  min-height: 44px;
}

.plus {
  flex: none;
  color: var(--color-accent);
}

.slot-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.slot-right {
  flex: 1;
  min-width: 0;
  text-align: right;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.remove {
  flex: none;
  width: 32px;
  height: 32px;
}

.mobile .remove {
  width: 44px;
  height: 44px;
}

.detail-dock {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reason {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.qty-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.qty-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stepper {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 0 1px var(--color-neutral-700);
}

.step-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  min-height: 40px;
}

.mobile .step-btn {
  min-width: 44px;
  min-height: 44px;
}

.qty-value {
  min-width: 32px;
  text-align: center;
  font-size: 14px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}

.max-btn {
  min-height: 40px;
  color: var(--color-neutral-300);
}

.mobile .max-btn {
  min-height: 44px;
}

.step-btn[aria-disabled='true'],
.max-btn[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}

.craft-btn {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  min-width: 0;
}

.mobile .craft-btn {
  flex: 1 1 100%;
  min-height: 44px;
}

.craft-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.craft-btn[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}
</style>
