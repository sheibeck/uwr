<script setup lang="ts">
import { computed, inject, nextTick, ref, useTemplateRef, watch } from 'vue';
import { PhX } from '@phosphor-icons/vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { ActionRunner } from '../ledger/actionRunner';
import GoldAmount from '../ledger/GoldAmount.vue';
import InlineConfirm from '../ledger/InlineConfirm.vue';
import { slotUsage } from './backpack';
import { dockSummary, inspectorView, salvagePrompt } from './inspector';
import type { MetaPart } from './inspector';

// The inventory inspector (50-UI-SPEC "Inspector", "Comparison", "Actions per item", "Salvage
// confirmation", "Mobile inventory > Inspector dock"): the desktop card and the mobile dock. The
// view model decides everything shown; this component draws it and runs the actions through the
// screen's action runner. Item names, affixes and flavor are server text, so they only reach the
// page as text nodes. Nothing is optimistic: the subscribed rows drive every change.
const props = defineProps<{
  instanceId: bigint | null;
  variant: 'card' | 'dock';
  runner: ActionRunner;
}>();
const emit = defineEmits<{ close: [] }>();

const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

const CRAFT_COLORS: Readonly<Record<string, string>> = {
  dented: 'var(--color-craft-dented)',
  standard: 'var(--color-craft-standard)',
  reinforced: 'var(--color-craft-reinforced)',
  exquisite: 'var(--color-craft-exquisite)',
  mastercraft: 'var(--color-craft-mastercraft)',
};

const instance = computed(() => {
  const id = props.instanceId;
  if (id === null) return null;
  return ledger.items.value.find((item) => item.id === id) ?? null;
});

const view = computed(() => {
  const item = instance.value;
  const character = game.character.value;
  if (item === null || character === null) return null;
  return inspectorView({
    instance: item,
    templates: ledger.templates.value,
    affixes: ledger.affixes.value,
    items: ledger.items.value,
    character,
    perkKeys: game.renownPerks.value.map((perk) => perk.perkKey),
    usage: slotUsage(ledger.items.value),
  });
});

const dock = computed(() => props.variant === 'dock');
const offline = computed(() => !game.connected.value || ledger.reducers.value === null);

const summary = computed(() => (view.value ? dockSummary(view.value) : ''));
const reason = computed(() => {
  const v = view.value;
  if (!v) return null;
  if (v.primary && v.primary.reason) return v.primary.reason;
  if (v.salvage.visible && v.salvage.reason) return v.salvage.reason;
  return null;
});

const salvageDescribed = computed(() => {
  const v = view.value;
  return !!v && v.salvage.reason !== null && reason.value === v.salvage.reason;
});

const reasonId = computed(() => `inspector-reason-${props.variant}`);
const primaryPending = computed(() => (view.value?.primary ? props.runner.isPending(`item-${view.value.primary.kind}`) : false));
const salvagePending = computed(() => props.runner.isPending('item-salvage'));
const primaryInert = computed(
  () => offline.value || primaryPending.value || !(view.value?.primary?.available ?? false),
);
const salvageInert = computed(
  () => offline.value || salvagePending.value || !(view.value?.salvage.available ?? false),
);

function metaStyle(part: MetaPart): Record<string, string> | undefined {
  if (part.tone !== 'craft' || part.craftQuality === undefined) return undefined;
  if (!Object.prototype.hasOwnProperty.call(CRAFT_COLORS, part.craftQuality)) return undefined;
  return { color: CRAFT_COLORS[part.craftQuality] };
}

function stillEquipped(instanceId: bigint): boolean {
  const row = ledger.items.value.find((item) => item.id === instanceId);
  if (!row) return false;
  return row.equippedSlot !== undefined && row.equippedSlot !== null && row.equippedSlot !== '';
}

function onPrimary(): void {
  const v = view.value;
  const reducers = ledger.reducers.value;
  const character = game.character.value;
  if (!v || !v.primary || !reducers || !character || primaryInert.value) return;
  const characterId = character.id;
  const itemInstanceId = v.instanceId;
  const key = `item-${v.primary.kind}`;
  switch (v.primary.kind) {
    case 'equip':
      void props.runner.run(key, () => reducers.equipItem({ characterId, itemInstanceId }));
      break;
    case 'unequip': {
      const slot = v.equippedSlot;
      if (slot === null) return;
      void props.runner.run(key, () => reducers.unequipItem({ characterId, slot }));
      break;
    }
    case 'use':
      void props.runner.run(key, () => reducers.useItem({ characterId, itemInstanceId }));
      break;
    case 'learn':
      void props.runner.run(key, () => reducers.learnRecipeScroll({ characterId, itemInstanceId }));
      break;
  }
}

const confirming = ref(false);
const salvageButton = useTemplateRef<HTMLButtonElement>('salvageButton');

function onSalvage(): void {
  const v = view.value;
  if (!v || !v.salvage.visible || salvageInert.value) return;
  if (v.salvage.needsConfirm) {
    confirming.value = true;
    return;
  }
  void runSalvage();
}

// The server refuses to salvage an equipped item, so an equipped item is unequipped first. The
// salvage is sent only after the unequip settles and only while the ledger no longer shows the
// item equipped (RESEARCH assumption A1: skipped, harmlessly, when the cache lags). One pending
// key covers both calls, so the confirm button stays inert for the whole flow.
async function runSalvage(): Promise<void> {
  const v = view.value;
  const reducers = ledger.reducers.value;
  const character = game.character.value;
  if (!v || !reducers || !character) return;
  const characterId = character.id;
  const itemInstanceId = v.instanceId;
  const slot = v.equippedSlot;
  await props.runner.run('item-salvage', async () => {
    if (slot !== null) {
      await reducers.unequipItem({ characterId, slot });
      await nextTick();
      if (stillEquipped(itemInstanceId)) return;
    }
    await reducers.salvageItem({ characterId, itemInstanceId });
  });
  confirming.value = false;
}

watch(
  () => props.instanceId,
  () => {
    confirming.value = false;
  },
);
watch(view, (next) => {
  if (next === null) confirming.value = false;
});
</script>

<template>
  <section
    class="inspector"
    :class="dock ? 'dock' : 'card'"
    aria-label="Item details"
  >
    <template v-if="view">
      <template v-if="dock">
        <div class="dock-head">
          <span class="name dock-name" :style="{ color: view.nameColor }" :title="view.name">{{ view.name }}</span>
          <button
            type="button"
            class="btn btn-icon dock-close"
            aria-label="Close item details"
            @click="emit('close')"
          >
            <PhX :size="16" aria-hidden="true" />
          </button>
        </div>
        <p class="summary">{{ summary }}</p>
      </template>
      <template v-else>
        <div class="kicker" :style="{ color: view.nameColor }">{{ view.kicker }}</div>
        <div class="name" :style="{ color: view.nameColor }">{{ view.name }}</div>
        <div v-if="view.metaParts.length > 0" class="meta">
          <template v-for="(part, index) in view.metaParts" :key="index">
            <span v-if="index > 0" class="sep" aria-hidden="true"> · </span>
            <span
              class="meta-part"
              :class="{ short: part.tone === 'short' }"
              :style="metaStyle(part)"
            >{{ part.text }}</span>
          </template>
        </div>
        <div v-if="view.caption" class="caption">{{ view.caption }}</div>
        <dl v-if="view.rows.length > 0" class="stats">
          <template v-for="row in view.rows" :key="row.key">
            <dt class="stat-label">{{ row.label }}</dt>
            <dd class="stat-value">
              <span>{{ row.valueText }}</span>
              <template v-if="row.marker !== ''">
                <span
                  class="marker"
                  :class="row.marker === 'up' ? 'up' : 'down'"
                  aria-hidden="true"
                >{{ row.markerText }}</span>
                <span class="sr-only">{{ row.srText }}</span>
              </template>
            </dd>
          </template>
        </dl>
        <ul v-if="view.affixRows.length > 0" class="affixes">
          <li v-for="(row, index) in view.affixRows" :key="index" class="affix-row">
            <span class="affix-name">{{ row.name }}</span>
            <span class="affix-text">{{ row.text }}</span>
          </li>
        </ul>
        <p v-if="view.flavor" class="flavor">{{ view.flavor }}</p>
      </template>

      <p v-if="reason && dock" :id="reasonId" class="reason">{{ reason }}</p>

      <div v-if="view.primary || view.salvage.visible" class="action-block">
        <div v-show="!confirming" class="actions" :class="{ mobile: dock }">
          <button
            v-if="view.primary"
            type="button"
            class="btn btn-primary action primary"
            :aria-disabled="primaryInert ? 'true' : undefined"
            :aria-describedby="view.primary.reason ? reasonId : undefined"
            @click="onPrimary"
          >
            {{ dock ? view.primary.mobileLabel : view.primary.label }}
          </button>
          <button
            v-if="view.salvage.visible"
            ref="salvageButton"
            type="button"
            class="btn btn-secondary action salvage"
            :aria-disabled="salvageInert ? 'true' : undefined"
            :aria-describedby="salvageDescribed ? reasonId : undefined"
            @click="onSalvage"
          >
            {{ dock ? 'Salvage' : 'Salvage item' }}
          </button>
        </div>
        <InlineConfirm
          v-if="confirming"
          :prompt="salvagePrompt(view.name, view.equipped)"
          confirm-label="Yes, salvage"
          :pending="salvagePending"
          :mobile="dock"
          :opener="salvageButton"
          @confirm="runSalvage"
          @keep="confirming = false"
        />
      </div>

      <p v-if="reason && !dock" :id="reasonId" class="reason">{{ reason }}</p>

      <p class="footer">
        <template v-if="view.footer.kind === 'sell' && view.footer.amount !== null">
          <span>{{ view.footer.text }}</span>
          <GoldAmount :amount="view.footer.amount" tone="muted" />
        </template>
        <template v-else>{{ view.footer.text }}</template>
      </p>
    </template>
    <p v-else-if="!dock" class="empty">Select an item to see its details.</p>
  </section>
</template>

<style scoped>
.inspector {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: var(--radius-md);
  background: var(--color-bg);
  font-variant-numeric: tabular-nums;
}

.card {
  box-shadow: var(--shadow-sm);
}

.dock {
  flex: none;
}

p {
  margin: 0;
}

.kicker {
  font-size: 10px;
  line-height: 1.5;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  overflow-wrap: anywhere;
}

.name {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.dock-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dock-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dock-close {
  flex: none;
  width: 44px;
  height: 44px;
  min-height: 44px;
}

.summary {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.meta {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.meta-part.short {
  color: var(--color-con-red);
}

.caption {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
  overflow-wrap: anywhere;
}

.stats {
  display: grid;
  grid-template-columns: 1fr auto;
  row-gap: 4px;
  column-gap: 8px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.stat-label {
  color: var(--color-neutral-300);
}

.stat-value {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 4px;
  margin: 0;
  color: var(--color-text);
}

.marker.up {
  color: var(--color-con-light-green);
}

.marker.down {
  color: var(--color-con-red);
}

.affixes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-accent-300);
}

.affix-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.affix-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.affix-text {
  flex: none;
}

.flavor {
  font-size: 12px;
  font-style: italic;
  line-height: 1.5;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.actions {
  display: flex;
  gap: 8px;
}

.action {
  min-height: 32px;
}

.action.primary {
  flex: 1;
}

.actions.mobile .action {
  min-height: 44px;
}

.action[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}

.reason {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.footer {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
  overflow-wrap: anywhere;
}

.empty {
  font-size: 12px;
  line-height: 1.5;
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
