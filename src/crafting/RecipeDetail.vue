<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue';
import { PhHammer, PhPlusCircle, PhX } from '@phosphor-icons/vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { ActionRunner } from '../ledger/actionRunner';
import { rarityColor } from '../ledger/itemModel';
import ReagentPicker from './ReagentPicker.vue';
import {
  bagCount,
  craftArgs,
  craftAvailability,
  essenceKeyOf,
  essenceMagnitudeText,
  essenceOptions,
  reagentEffectText,
  reagentOptions,
  recipeDetail,
  stationHere,
} from './craftingModel';

// The selected recipe (50-UI-SPEC "Recipe detail", "Craft unavailable", "After Craft", "Optional
// reagent", with the owner decision that replaces the odds bar): the Recipe kicker, the name, the
// meta line, the have-of-need tiles, for a gear recipe the single deterministic Quality line with
// the hint that would raise it, the essence slot and the reagent slots with the inline picker, the
// reason line and Craft. Every verdict (materials, essence, reagents, bag room) is the shared
// planCraft through the model, so the client shows what the server will decide. Recipe, material
// and reagent names are server text and only reach the page as text nodes.
const props = defineProps<{
  recipeId: bigint;
  runner: ActionRunner;
  mobile: boolean;
}>();

const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

const CRAFT_COLORS: Readonly<Record<string, string>> = {
  dented: 'var(--color-craft-dented)',
  standard: 'var(--color-craft-standard)',
  reinforced: 'var(--color-craft-reinforced)',
  exquisite: 'var(--color-craft-exquisite)',
  mastercraft: 'var(--color-craft-mastercraft)',
};

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

const tierColor = computed(() => {
  const key = detail.value?.qualityKey ?? null;
  if (key === null || !Object.prototype.hasOwnProperty.call(CRAFT_COLORS, key)) return undefined;
  return CRAFT_COLORS[key];
});

// --- the chosen essence and reagents (slot order; null is an empty slot) ---
const essenceId = ref<bigint | null>(null);
const reagentIds = ref<Array<bigint | null>>([]);
type PickerState = { kind: 'essence' } | { kind: 'reagent'; index: number } | null;
const picker = ref<PickerState>(null);

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
watch(() => props.recipeId, resetChoices);

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

const availability = computed(() => {
  const r = recipe.value;
  if (!r) return null;
  return craftAvailability({
    recipe: r,
    station: station.value,
    templates: ledger.templates.value,
    items: ledger.items.value,
    choice: { essenceId: essenceId.value, reagentIds: reagentIds.value },
  });
});

const REASON_ID = computed(() => `craft-reason-${props.mobile ? 'mobile' : 'desktop'}`);
const reason = computed(() => availability.value?.reason ?? null);
const craftPending = computed(() => props.runner.isPending('craft'));
const craftInert = computed(
  () => offline.value || craftPending.value || availability.value === null || !availability.value.available,
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

function onCraft(): void {
  const reducers = ledger.reducers.value;
  const c = character.value;
  if (!reducers || !c || craftInert.value) return;
  const args = craftArgs(c.id, props.recipeId, { essenceId: essenceId.value, reagentIds: reagentIds.value });
  void props.runner.run('craft', () => reducers.craftRecipe(args));
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
        <span v-if="!props.mobile" class="kicker">Recipe</span>
        <h4 class="title">{{ detail.name }}</h4>
        <p v-if="detail.metaParts.length > 0" class="meta">
          <template v-for="(part, index) in detail.metaParts" :key="index">
            <span v-if="index > 0" aria-hidden="true"> · </span>
            <span class="meta-part" :class="{ short: part.tone === 'short' }">{{ part.text }}</span>
          </template>
        </p>

        <ul v-if="props.mobile" class="material-rows">
          <li v-for="tile in detail.tiles" :key="String(tile.templateId)" class="material-row">
            <span class="mat-name" :title="tile.name">{{ tile.name }}</span>
            <span class="mat-count" :class="tile.short ? 'short' : 'met'">{{ tile.mobileText }}</span>
          </li>
        </ul>
        <div v-else class="tiles">
          <div v-for="tile in detail.tiles" :key="String(tile.templateId)" class="tile">
            <span class="tile-name" :title="tile.name">{{ tile.name }}</span>
            <span class="tile-count">
              <span class="have" :class="{ short: tile.short }">{{ tile.have }}</span>
              <span class="of"> of {{ tile.need }}</span>
            </span>
          </div>
        </div>

        <section v-if="detail.gear" class="quality">
          <h6>Quality</h6>
          <span class="tier" :style="tierColor ? { color: tierColor } : undefined">{{ detail.quality }}</span>
          <p v-if="detail.qualityHint" class="hint">{{ detail.qualityHint }}</p>
        </section>

        <section v-if="detail.gear" class="reagents">
          <h6>Optional reagent</h6>
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
        </section>
      </div>

      <div class="detail-dock">
        <p v-if="reason" :id="REASON_ID" class="reason">{{ reason }}</p>
        <button
          type="button"
          class="btn btn-primary craft-btn"
          :aria-label="`Craft ${detail.name}`"
          :aria-disabled="craftInert ? 'true' : undefined"
          :aria-describedby="reason ? REASON_ID : undefined"
          @click="onCraft"
        >
          <PhHammer :size="16" aria-hidden="true" />
          <span class="craft-text">{{ props.mobile ? 'Craft' : `Craft ${detail.name}` }}</span>
        </button>
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

.kicker {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  line-height: 1.5;
  color: var(--color-accent);
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

.tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.tile-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
}

.have {
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
}

.have.short {
  color: var(--color-con-red);
}

.of {
  font-size: 12px;
  color: var(--color-neutral-500);
}

.material-rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.material-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 44px;
  font-size: 12px;
  line-height: 1.5;
}

.mat-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.mat-count.met {
  color: var(--color-con-light-green);
}

.mat-count.short {
  color: var(--color-con-red);
}

.quality,
.reagents {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

h6 {
  margin: 0;
  color: var(--color-neutral-400);
}

.tier {
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
}

.hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
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

.craft-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  min-width: 0;
}

.mobile .craft-btn {
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
