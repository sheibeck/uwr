<script setup lang="ts">
import { computed, inject } from 'vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import { gearStatTotals } from '../ledger/compare';
import {
  EQUIP_SLOT_ORDER,
  itemName,
  itemRarity,
  nameColor,
  ringColor,
  slotLabel,
} from '../ledger/itemModel';
import type { ItemStatKey } from '@game-data/item_stats';

// The Equipped column (50-UI-SPEC "Equipped column"): twelve slot cards in the contract order and the
// Gear totals. A filled slot is a button that puts the equipped item in the inspector; an empty slot
// is static. The comparison-target slot (the slot of the bag gear item being inspected) gets the
// accent ring. Item names are server text, so they only reach the page as text nodes.
const props = withDefaults(
  defineProps<{
    selectedId: bigint | null;
    compareSlot: string | null;
    mobile?: boolean;
  }>(),
  { mobile: false },
);
const emit = defineEmits<{ select: [instanceId: bigint] }>();

const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

interface SlotCard {
  slot: string;
  label: string;
  filled: boolean;
  instanceId: bigint;
  name: string;
  rarity: string;
  nameColor: string;
  pressed: boolean;
  compareTarget: boolean;
  ariaLabel: string;
  ring: string | undefined;
}

const cards = computed<SlotCard[]>(() =>
  EQUIP_SLOT_ORDER.map((slot) => {
    const label = slotLabel(slot);
    const compareTarget = props.compareSlot === slot;
    const instance = ledger.items.value.find((item) => item.equippedSlot === slot);
    const template = instance ? ledger.templates.value.get(instance.templateId) : undefined;
    if (!instance || !template) {
      return {
        slot,
        label,
        filled: false,
        instanceId: 0n,
        name: '',
        rarity: '',
        nameColor: '',
        pressed: false,
        compareTarget,
        ariaLabel: '',
        ring: undefined,
      };
    }
    const rarity = itemRarity(instance, template);
    const name = itemName(instance, template);
    const pressed = props.selectedId === instance.id;
    return {
      slot,
      label,
      filled: true,
      instanceId: instance.id,
      name,
      rarity,
      nameColor: nameColor(rarity, template.isJunk),
      pressed,
      compareTarget,
      ariaLabel: `${label}: ${name}, ${rarity}`,
      ring: pressed
        ? `inset 0 0 0 2px ${ringColor(rarity, { junk: template.isJunk, selected: true })}`
        : undefined,
    };
  }),
);

const anyEquipped = computed(() => ledger.items.value.some((item) => !!item.equippedSlot));

const GEAR_STATS: ReadonlyArray<{ label: string; gear: ItemStatKey; base: 'str' | 'dex' | 'int' | 'wis' | 'cha' }> = [
  { label: 'Strength', gear: 'strBonus', base: 'str' },
  { label: 'Dexterity', gear: 'dexBonus', base: 'dex' },
  { label: 'Intelligence', gear: 'intBonus', base: 'int' },
  { label: 'Wisdom', gear: 'wisBonus', base: 'wis' },
  { label: 'Charisma', gear: 'chaBonus', base: 'cha' },
];

const totals = computed(() => {
  const character = game.character.value;
  const gear = gearStatTotals(ledger.items.value, ledger.templates.value, ledger.affixes.value);
  const rows: { label: string; total: bigint; gear: bigint }[] = [];
  if (character) {
    for (const def of GEAR_STATS) {
      const bonus = gear[def.gear];
      if (bonus > 0n) rows.push({ label: def.label, total: character[def.base] + bonus, gear: bonus });
    }
  }
  return rows;
});

const armorClass = computed(() => game.character.value?.armorClass ?? 0n);
</script>

<template>
  <div class="equipped" :class="{ mobile: props.mobile }">
    <h6 v-if="!props.mobile">Equipped</h6>
    <div class="slot-grid">
      <template v-for="card in cards" :key="card.slot">
        <button
          v-if="card.filled"
          type="button"
          class="slot-card filled"
          :class="{ 'compare-target': card.compareTarget }"
          :style="card.ring ? { boxShadow: card.ring } : undefined"
          :aria-label="card.ariaLabel"
          :aria-pressed="card.pressed ? 'true' : 'false'"
          @click="emit('select', card.instanceId)"
        >
          <span class="slot-label">{{ card.label }}</span>
          <span class="slot-name" :style="{ color: card.nameColor }" :title="card.name">{{ card.name }}</span>
        </button>
        <div v-else class="slot-card empty" :class="{ 'compare-target': card.compareTarget }">
          <span class="slot-label">{{ card.label }}</span>
          <span class="slot-name none">Empty</span>
        </div>
      </template>
    </div>

    <hr class="hr" />

    <h6>Gear totals</h6>
    <dl class="totals">
      <dt class="total-label">Armor Class</dt>
      <dd class="total-value">{{ armorClass }}</dd>
      <template v-for="row in totals" :key="row.label">
        <dt class="total-label">{{ row.label }}</dt>
        <dd class="total-value">
          <span>{{ row.total }}</span>
          <span class="gear-bonus">+{{ row.gear }}</span>
        </dd>
      </template>
    </dl>
    <p v-if="!anyEquipped" class="no-bonus">No gear bonuses yet.</p>
  </div>
</template>

<style scoped>
.equipped {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-variant-numeric: tabular-nums;
}

h6 {
  margin: 0;
  color: var(--color-neutral-400);
}

.slot-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.slot-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  min-width: 0;
  padding: 8px;
  border: 0;
  border-radius: var(--radius-md);
  background-color: var(--color-bg);
  color: inherit;
  font-family: inherit;
  text-align: left;
}

.mobile .slot-card {
  min-height: 44px;
}

button.slot-card {
  cursor: pointer;
}

button.slot-card:hover {
  background-image: linear-gradient(
    color-mix(in srgb, var(--color-text) 7%, transparent),
    color-mix(in srgb, var(--color-text) 7%, transparent)
  );
}

button.slot-card:active {
  background-image: linear-gradient(
    color-mix(in srgb, var(--color-text) 14%, transparent),
    color-mix(in srgb, var(--color-text) 14%, transparent)
  );
}

button.slot-card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.slot-card.compare-target {
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.slot-label {
  font-size: 10px;
  line-height: 1.5;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-neutral-500);
}

.compare-target .slot-label {
  color: var(--color-accent-300);
}

.slot-name {
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.slot-name.none {
  color: var(--color-neutral-600);
}

.hr {
  width: 100%;
  margin: 8px 0;
}

.totals {
  display: grid;
  grid-template-columns: 1fr auto;
  row-gap: 8px;
  column-gap: 8px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.total-label {
  color: var(--color-neutral-400);
}

.total-value {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin: 0;
  color: var(--color-text);
}

.gear-bonus {
  color: var(--color-con-light-green);
}

.no-bonus {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

</style>
