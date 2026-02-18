<template>
  <div
    :style="{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9500 }"
    @click.self="$emit('close')"
  >
    <div :style="{ background: '#141821', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '1.5rem', width: '480px', maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 16px 40px rgba(0,0,0,0.7)' }">

      <!-- Header -->
      <div :style="{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }">
        <div :style="{ fontSize: '1rem', fontWeight: 'bold', color: '#e6e8ef', textTransform: 'uppercase', letterSpacing: '0.07em' }">
          Craft: {{ recipe.name }}
        </div>
        <button :style="{ background: 'transparent', border: 'none', color: '#888', fontSize: '1.2rem', cursor: 'pointer', padding: '0 4px' }" @click="$emit('close')">×</button>
      </div>

      <!-- Base Item Preview -->
      <div :style="{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '0.75rem', marginBottom: '0.75rem' }">
        <div :style="{ fontSize: '0.75rem', color: '#666', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }">Base Item</div>
        <div :style="{ color: rarityColor(recipe.outputItem?.rarity ?? 'common'), fontWeight: 'bold', fontSize: '0.95rem' }">
          {{ recipe.outputItem?.name ?? recipe.outputName }}
        </div>
        <div :style="{ fontSize: '0.75rem', color: '#888', marginTop: '2px' }">
          {{ recipe.outputItem?.slot ?? '' }}
          <span v-if="craftQualityLabel" :style="{ color: craftQualityColor, marginLeft: '6px' }">· {{ craftQualityLabel }} Quality</span>
        </div>
        <div v-if="recipe.outputItem?.stats?.length" :style="{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px' }">
          <span
            v-for="stat in recipe.outputItem.stats"
            :key="stat.label"
            :style="{ fontSize: '11px', color: '#aaa', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', padding: '1px 5px' }"
          >{{ stat.label }}: {{ stat.value }}</span>
        </div>
      </div>

      <!-- Base Requirements -->
      <div :style="{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '0.75rem', marginBottom: '0.75rem' }">
        <div :style="{ fontSize: '0.75rem', color: '#666', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }">Required Materials</div>
        <div v-for="req in recipe.requirements" :key="req.name" :style="{ fontSize: '0.8rem', marginBottom: '2px' }">
          <span :style="{ color: req.hasMaterial ? '#4a6' : '#c44' }">{{ req.name }}</span>
          <span :style="{ color: '#666' }">: {{ req.available }}/{{ req.required }}</span>
        </div>
      </div>

      <!-- Catalyst Slot (Essence) -->
      <div :style="{ marginBottom: '0.75rem' }">
        <div :style="{ fontSize: '0.75rem', color: '#666', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }">
          Essence Catalyst
          <span :style="{ color: '#555', fontWeight: 'normal', textTransform: 'none', marginLeft: '6px' }">(optional — unlocks stat affixes)</span>
        </div>
        <select
          :value="selectedCatalystId?.toString() ?? ''"
          @change="onCatalystChange"
          :style="selectStyle"
        >
          <option value="">— No Essence (base item only) —</option>
          <option
            v-for="ess in essenceItems"
            :key="ess.templateId.toString()"
            :value="ess.templateId.toString()"
          >{{ ess.name }} (+{{ ess.magnitude }} per affix) · {{ ess.available }}x in bag</option>
        </select>
        <div v-if="catalystError" :style="{ color: '#c44', fontSize: '11px', marginTop: '3px' }">{{ catalystError }}</div>
      </div>

      <!-- Modifier Slots -->
      <div v-if="selectedCatalystId && slotsAvailable > 0" :style="{ marginBottom: '0.75rem' }">
        <div :style="{ fontSize: '0.75rem', color: '#666', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }">
          Modifier Slots
          <span :style="{ color: '#555', fontWeight: 'normal', textTransform: 'none', marginLeft: '6px' }">
            ({{ slotsAvailable }} slot{{ slotsAvailable > 1 ? 's' : '' }} at {{ craftQualityLabel }} quality)
          </span>
        </div>
        <div v-for="slotIndex in slotsAvailable" :key="slotIndex" :style="{ marginBottom: '6px' }">
          <div :style="{ fontSize: '11px', color: '#555', marginBottom: '2px' }">Slot {{ slotIndex }}</div>
          <select
            :value="selectedModifierIds[slotIndex - 1]?.toString() ?? ''"
            @change="onModifierChange(slotIndex - 1, $event)"
            :style="selectStyle"
          >
            <option value="">— No modifier —</option>
            <option
              v-for="mod in availableModifiersForSlot(slotIndex - 1)"
              :key="mod.templateId.toString()"
              :value="mod.templateId.toString()"
            >{{ mod.name }} — {{ mod.description }} · {{ mod.available }}x in bag</option>
          </select>
        </div>
      </div>

      <!-- Reagent required hint -->
      <div v-if="selectedCatalystId && slotsAvailable > 0 && appliedAffixes.length === 0" :style="{ color: '#c44', fontSize: '11px', marginBottom: '0.5rem' }">
        Select at least one reagent to use your Essence.
      </div>

      <!-- Live Preview -->
      <div v-if="selectedCatalystId && appliedAffixes.length > 0" :style="{ background: 'rgba(76,125,240,0.07)', border: '1px solid rgba(76,125,240,0.2)', borderRadius: '6px', padding: '0.75rem', marginBottom: '0.75rem' }">
        <div :style="{ fontSize: '0.75rem', color: '#666', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }">Item Preview</div>
        <div :style="{ color: rarityColor(recipe.outputItem?.rarity ?? 'common'), fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '4px' }">
          {{ previewName }}
        </div>
        <div v-for="affix in appliedAffixes" :key="affix.statKey" :style="{ fontSize: '12px', color: '#4c7df0', marginBottom: '1px' }">
          +{{ getMagnitudeForStat(affix.statKey) }} {{ affix.label }}
        </div>
      </div>

      <!-- Actions -->
      <div :style="{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }">
        <button
          :style="{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: '#a0a3ab', cursor: 'pointer', fontSize: '0.85rem' }"
          @click="$emit('close')"
        >
          Cancel
        </button>
        <button
          :style="craftButtonStyle"
          :disabled="!canCraft"
          @click="handleCraft"
        >
          Craft
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { getModifierMagnitude } from '../composables/useCrafting';

type Recipe = {
  id: bigint;
  name: string;
  outputName: string;
  outputCount: bigint;
  craftQuality: string;
  requirements: { name: string; required: bigint; available: bigint; hasMaterial: boolean }[];
  canCraft: boolean;
  recipeType: string;
  outputItem: {
    name: string;
    rarity: string;
    slot: string;
    stats: { label: string; value: string }[];
  } | null;
};

type EssenceItem = {
  templateId: bigint;
  name: string;
  magnitude: number;
  available: bigint;
};

type ModifierItem = {
  templateId: bigint;
  name: string;
  description: string;
  statKey: string;
  available: bigint;
};

const props = defineProps<{
  recipe: Recipe;
  essenceItems: EssenceItem[];
  modifierItems: ModifierItem[];
}>();

const emit = defineEmits<{
  (e: 'craft', args: {
    recipeTemplateId: bigint;
    catalystTemplateId?: bigint;
    modifier1TemplateId?: bigint;
    modifier2TemplateId?: bigint;
    modifier3TemplateId?: bigint;
  }): void;
  (e: 'close'): void;
}>();

const AFFIX_SLOTS: Record<string, number> = {
  dented:      0,
  standard:    1,
  reinforced:  2,
  exquisite:   3,
  mastercraft: 3,
};

const ESSENCE_QUALITY_GATE: Record<string, string[]> = {
  'Lesser Essence':  ['standard'],
  'Essence':         ['standard', 'reinforced'],
  'Greater Essence': ['standard', 'reinforced', 'exquisite'],
};

const STAT_LABEL: Record<string, string> = {
  strBonus: 'Strength',
  dexBonus: 'Dexterity',
  intBonus: 'Intelligence',
  wisBonus: 'Wisdom',
  chaBonus: 'Charisma',
  hpBonus: 'Max HP',
  manaBonus: 'Max Mana',
  armorClassBonus: 'Armor Class',
  magicResistanceBonus: 'Magic Resistance',
};

const AFFIX_SUFFIX: Record<string, string> = {
  strBonus: 'of Strength',
  dexBonus: 'of Dexterity',
  intBonus: 'of Intelligence',
  wisBonus: 'of Wisdom',
  chaBonus: 'of Charisma',
  hpBonus: 'of Vitality',
  manaBonus: 'of the Arcane',
  armorClassBonus: 'of Warding',
  magicResistanceBonus: 'of Magic Resistance',
};

const selectedCatalystId = ref<bigint | null>(null);
const selectedModifierIds = ref<(bigint | null)[]>([null, null, null]);

const craftQuality = computed(() => props.recipe.craftQuality || 'standard');

const craftQualityLabel = computed(() => {
  const q = craftQuality.value;
  return q.charAt(0).toUpperCase() + q.slice(1);
});

const craftQualityColor = computed(() => {
  const map: Record<string, string> = {
    dented: '#888',
    standard: '#ccc',
    reinforced: '#6c9',
    exquisite: '#9cf',
    mastercraft: '#f90',
  };
  return map[craftQuality.value] ?? '#ccc';
});

const slotsAvailable = computed(() => {
  if (!selectedCatalystId.value) return 0;
  const essenceItem = props.essenceItems.find(e => e.templateId.toString() === selectedCatalystId.value?.toString());
  if (!essenceItem) return 0;
  const allowed = ESSENCE_QUALITY_GATE[essenceItem.name] ?? [];
  if (!allowed.includes(craftQuality.value)) return 0;
  return AFFIX_SLOTS[craftQuality.value] ?? 1;
});

function getMagnitudeForStat(statKey: string): number {
  if (!selectedCatalystId.value) return 0;
  const essenceItem = props.essenceItems.find(e => e.templateId.toString() === selectedCatalystId.value?.toString());
  if (!essenceItem) return 1;
  return getModifierMagnitude(essenceItem.name, statKey);
}

const catalystError = computed(() => {
  if (!selectedCatalystId.value) return null;
  const essenceItem = props.essenceItems.find(e => e.templateId.toString() === selectedCatalystId.value?.toString());
  if (!essenceItem) return null;
  const allowed = ESSENCE_QUALITY_GATE[essenceItem.name] ?? [];
  if (!allowed.includes(craftQuality.value)) {
    return `${essenceItem.name} cannot be used on ${craftQualityLabel.value} quality items.`;
  }
  return null;
});

// Modifiers already chosen in earlier slots (to avoid duplicate stat selection)
const usedModifierIds = computed(() => {
  const used = new Set<string>();
  for (const id of selectedModifierIds.value) {
    if (id != null) used.add(id.toString());
  }
  return used;
});

const availableModifiersForSlot = (slotIndex: number) => {
  const currentId = selectedModifierIds.value[slotIndex]?.toString();
  return props.modifierItems.filter(mod => {
    const idStr = mod.templateId.toString();
    return !usedModifierIds.value.has(idStr) || idStr === currentId;
  });
};

const appliedAffixes = computed(() => {
  if (!selectedCatalystId.value) return [];
  return selectedModifierIds.value
    .slice(0, slotsAvailable.value)
    .filter((id): id is bigint => id != null)
    .map(id => {
      const mod = props.modifierItems.find(m => m.templateId.toString() === id.toString());
      if (!mod) return null;
      return {
        statKey: mod.statKey,
        label: STAT_LABEL[mod.statKey] ?? mod.statKey,
        suffix: AFFIX_SUFFIX[mod.statKey] ?? 'of Power',
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);
});

const previewName = computed(() => {
  const baseName = props.recipe.outputItem?.name ?? props.recipe.outputName;
  if (appliedAffixes.value.length === 0) return baseName;
  const suffix = appliedAffixes.value.map(a => a.suffix).join(', ');
  return `${baseName} ${suffix}`;
});

const canCraft = computed(() => {
  if (!props.recipe.canCraft) return false;
  if (catalystError.value) return false;
  // If a catalyst (Essence) is selected, at least one reagent must be chosen
  if (selectedCatalystId.value && appliedAffixes.value.length === 0) return false;
  return true;
});

const selectStyle = {
  width: '100%',
  padding: '6px 8px',
  background: '#1a202c',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '4px',
  color: '#d0d3dc',
  fontSize: '12px',
  cursor: 'pointer',
};

const craftButtonStyle = computed(() => ({
  padding: '0.5rem 1.25rem',
  background: canCraft.value ? 'rgba(76, 125, 240, 0.2)' : 'rgba(80,80,80,0.2)',
  border: `1px solid ${canCraft.value ? 'rgba(76, 125, 240, 0.5)' : 'rgba(80,80,80,0.3)'}`,
  borderRadius: '6px',
  color: canCraft.value ? '#4c7df0' : '#555',
  cursor: canCraft.value ? 'pointer' : 'not-allowed',
  fontSize: '0.85rem',
  fontWeight: 'bold',
}));

const rarityColor = (rarity: string): string => {
  const map: Record<string, string> = {
    common: '#ffffff',
    uncommon: '#22c55e',
    rare: '#3b82f6',
    epic: '#aa44ff',
    legendary: '#ff8800',
  };
  return map[(rarity ?? 'common').toLowerCase()] ?? '#ffffff';
};

const onCatalystChange = (event: Event) => {
  const val = (event.target as HTMLSelectElement).value;
  selectedCatalystId.value = val ? BigInt(val) : null;
  // Reset modifiers when catalyst changes
  selectedModifierIds.value = [null, null, null];
};

const onModifierChange = (slotIndex: number, event: Event) => {
  const val = (event.target as HTMLSelectElement).value;
  const updated = [...selectedModifierIds.value];
  updated[slotIndex] = val ? BigInt(val) : null;
  selectedModifierIds.value = updated;
};

const handleCraft = () => {
  if (!canCraft.value) return;
  const [mod1, mod2, mod3] = selectedModifierIds.value;
  emit('craft', {
    recipeTemplateId: props.recipe.id,
    catalystTemplateId: selectedCatalystId.value ?? undefined,
    modifier1TemplateId: mod1 ?? undefined,
    modifier2TemplateId: mod2 ?? undefined,
    modifier3TemplateId: mod3 ?? undefined,
  });
};
</script>
