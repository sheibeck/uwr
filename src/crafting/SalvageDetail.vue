<script setup lang="ts">
import { computed, inject, ref, useTemplateRef, watch } from 'vue';
import { PhRecycle } from '@phosphor-icons/vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { ActionRunner } from '../ledger/actionRunner';
import InlineConfirm from '../ledger/InlineConfirm.vue';
import { instanceStats } from '../ledger/compare';
import { itemDetails, unitSellValue } from '../ledger/itemDetails';
import { itemIcon, itemName, itemRarity, nameColor } from '../ledger/itemModel';
import { salvagePreview } from '../ledger/salvagePreview';
import { salvageNeedsConfirm } from '../inventory/inspector';
import ItemCard from './ItemCard.vue';
import { SALVAGE_YIELD_HEADING, salvageYieldHint } from './salvageModel';

// The Salvage detail (mock 9a, EXTRACT C.9, with plan 50-38's deliberate deviations). It uses the same
// reducer, rules, preview and confirm text as Inventory: salvageItem through the runner key 'salvage',
// the salvageNeedsConfirm rule, and salvagePreview for the rows and the confirm prompt. Because of the
// owner's 2026-10-07 rule (plan 50-40) the heading, the rows and the confirm speak only in chances: the
// heading reads 'May return', every row is a chance from the preview's yields, a hint line stands in for
// component rows that cannot be named or do not exist, and the confirm prompt is the preview's own
// confirm text. That deliberately replaces the mock's receive heading, its guaranteed row and its own
// confirm sentence. An equipped item can never be salvaged: the list never offers one, and a stale
// equipped instance makes the button unavailable and sends nothing. Selecting another item closes an
// open confirm, because the shared prompt does not name the item. Server text only reaches the page as
// text nodes.
const props = defineProps<{
  instanceId: bigint;
  runner: ActionRunner;
  mobile: boolean;
}>();

const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

const character = computed(() => game.character.value);
const instance = computed(() => ledger.items.value.find((item) => item.id === props.instanceId) ?? null);
const template = computed(() => {
  const item = instance.value;
  return item === null ? null : (ledger.templates.value.get(item.templateId) ?? null);
});

const name = computed(() => itemName(instance.value, template.value));
const color = computed(() => {
  const item = instance.value;
  const t = template.value;
  return item === null || t === null ? 'var(--color-text)' : nameColor(itemRarity(item, t), t.isJunk);
});

const card = computed(() => {
  const item = instance.value;
  const t = template.value;
  const c = character.value;
  if (item === null || t === null || c === null) return null;
  return {
    icon: itemIcon(t),
    details: itemDetails({
      template: t,
      stats: instanceStats(item, t, ledger.affixes.value),
      characterLevel: c.level,
      sellValue: unitSellValue(
        t,
        c,
        game.renownPerks.value.map((perk) => perk.perkKey),
      ),
    }),
  };
});

// What a salvage of this item may give back, by the server's own rule (the same call Inventory's
// confirm makes). The recipe is passed only once the hub has applied it.
const preview = computed(() => {
  const item = instance.value;
  const t = template.value;
  const c = character.value;
  if (item === null || t === null || c === null) return null;
  return salvagePreview({
    instance: item,
    template: t,
    affixes: ledger.affixes.value,
    characterId: c.id,
    outputRecipe: ledger.outputRecipesApplied.value
      ? (ledger.outputRecipes.value.get(t.id) ?? null)
      : undefined,
    templates: ledger.templates.value,
  });
});

const hint = computed(() => (preview.value ? salvageYieldHint(preview.value) : ''));

const offline = computed(() => !game.connected.value || ledger.reducers.value === null);
const pending = computed(() => props.runner.isPending('salvage'));
const equipped = computed(() => {
  const slot = instance.value?.equippedSlot;
  return slot !== undefined && slot !== null && slot !== '';
});
const inert = computed(() => offline.value || pending.value || equipped.value);

const confirming = ref(false);
const salvageButton = useTemplateRef<HTMLButtonElement>('salvageButton');

function onSalvage(): void {
  const item = instance.value;
  const t = template.value;
  if (item === null || t === null || inert.value) return;
  if (salvageNeedsConfirm(item, t, ledger.affixes.value)) {
    confirming.value = true;
    return;
  }
  void runSalvage();
}

// One call; the server refuses an equipped item and re-checks ownership. The result card opens from the
// server's own row.
async function runSalvage(): Promise<void> {
  const reducers = ledger.reducers.value;
  const c = character.value;
  const item = instance.value;
  if (!reducers || !c || item === null || equipped.value) return;
  const characterId = c.id;
  const itemInstanceId = item.id;
  await props.runner.run('salvage', () => reducers.salvageItem({ characterId, itemInstanceId }));
  confirming.value = false;
}

watch(
  () => props.instanceId,
  () => {
    confirming.value = false;
  },
);
watch(instance, (next) => {
  if (next === null) confirming.value = false;
});
</script>

<template>
  <section class="salvage-detail" :class="{ mobile: props.mobile }" aria-label="Salvage details">
    <template v-if="instance && template && card">
      <div class="detail-body">
        <ItemCard
          :kicker="props.mobile ? '' : 'Salvage'"
          :name="name"
          :color="color"
          :icon="card.icon"
          :details="card.details"
          :mobile="props.mobile"
        />
        <section v-if="preview" class="yields">
          <h6>{{ SALVAGE_YIELD_HEADING }}</h6>
          <p v-if="hint" class="yield-hint">{{ hint }}</p>
          <ul v-if="preview.yields.length > 0" class="yield-rows">
            <li v-for="row in preview.yields" :key="row.key" class="yield-row">
              <component :is="row.icon" :size="14" class="yield-icon" :style="{ color: row.iconColor }" aria-hidden="true" />
              <span class="yield-text">
                <span class="yield-name">{{ row.name }}</span>
                <span v-if="row.note" class="yield-note">{{ row.note }}</span>
              </span>
              <span class="yield-value">{{ row.text }}</span>
            </li>
          </ul>
        </section>
      </div>

      <div v-if="preview" class="action-block">
        <button
          v-show="!confirming"
          ref="salvageButton"
          type="button"
          class="btn btn-primary salvage-btn"
          :aria-disabled="inert ? 'true' : undefined"
          @click="onSalvage"
        >
          <PhRecycle :size="16" aria-hidden="true" />
          <span class="salvage-text">Salvage {{ name }}</span>
        </button>
        <InlineConfirm
          v-if="confirming"
          warning
          :prompt="preview.confirmText"
          confirm-label="Salvage"
          :pending="pending"
          :mobile="props.mobile"
          :opener="salvageButton"
          @confirm="runSalvage"
          @keep="confirming = false"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.salvage-detail {
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

.salvage-detail.mobile {
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

.yields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

h6 {
  margin: 0;
  color: var(--color-neutral-400);
}

.yield-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
}

.yield-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.yield-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: var(--radius-md);
  background: var(--color-bg);
  font-size: 14px;
  line-height: 1.5;
}

.yield-icon {
  flex: none;
}

.yield-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.yield-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.yield-note {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
  overflow-wrap: anywhere;
}

.yield-value {
  flex: none;
  min-width: 64px;
  text-align: right;
  font-size: 12px;
  color: var(--color-accent-300);
  white-space: nowrap;
}

.action-block {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.salvage-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  min-width: 0;
}

.mobile .salvage-btn {
  min-height: 44px;
}

.salvage-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.salvage-btn[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}
</style>
