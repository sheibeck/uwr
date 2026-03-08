<template>
  <div :style="barStyle">
    <!-- Flee button -->
    <button
      type="button"
      :disabled="isCastingAny"
      :style="[btnBase, fleeBtnStyle, isCastingAny ? btnDisabled : {}]"
      @click="$emit('flee')"
    >Flee</button>

    <!-- Ability buttons -->
    <button
      v-for="ability in abilities"
      :key="String(ability.id)"
      type="button"
      :disabled="isCastingAny || ability.isOnCooldown"
      :style="[
        btnBase,
        isCastingAny && castingAbilityId === ability.id ? btnCasting : {},
        ability.isOnCooldown ? btnCooldown : {},
        (isCastingAny || ability.isOnCooldown) ? btnDisabled : {},
      ]"
      @click="$emit('use-ability', ability.id)"
    >
      <!-- Cast bar fill -->
      <div
        v-if="isCastingAny && castingAbilityId === ability.id"
        :style="[castFillStyle, { width: Math.round(castProgress * 100) + '%' }]"
      />
      <!-- Cooldown fill -->
      <div
        v-if="ability.isOnCooldown && ability.cooldownSeconds > 0"
        :style="[cooldownFillStyle, { width: Math.round((ability.cooldownRemaining / ability.cooldownSeconds) * 100) + '%' }]"
      />
      <!-- Label -->
      <span :style="btnLabelStyle">
        {{ isCastingAny && castingAbilityId === ability.id ? 'Casting...' : ability.name }}
      </span>
      <!-- Cooldown number overlay -->
      <span v-if="ability.isOnCooldown && ability.cooldownRemaining > 0" :style="cooldownNumStyle">
        {{ ability.cooldownRemaining }}s
      </span>
    </button>

    <!-- Spacer -->
    <div :style="{ flex: 1 }" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export type CombatAbility = {
  id: bigint;
  name: string;
  kind: string;
  resourceType: string;
  resourceCost: bigint;
  castSeconds: bigint;
  cooldownSeconds: number;
  cooldownRemaining: number;
  isOnCooldown: boolean;
};

const props = defineProps<{
  abilities: CombatAbility[];
  castingAbilityId: bigint | null;
  castProgress: number;
}>();

defineEmits<{
  (e: 'flee'): void;
  (e: 'use-ability', abilityId: bigint): void;
}>();

const isCastingAny = computed(() => props.castingAbilityId !== null && props.castingAbilityId !== 0n);

const barStyle = {
  padding: '4px 12px',
  display: 'flex',
  gap: '4px',
  overflowX: 'auto' as const,
  alignItems: 'center',
};

const btnBase = {
  position: 'relative' as const,
  background: '#1a1a2e',
  border: '1px solid #2a2a3a',
  color: '#adb5bd',
  padding: '4px 10px',
  borderRadius: '3px',
  fontSize: '0.75rem',
  whiteSpace: 'nowrap' as const,
  cursor: 'pointer',
  height: '32px',
  overflow: 'hidden' as const,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '60px',
};

const fleeBtnStyle = {
  borderColor: '#5c2a2a',
  color: '#ff6b6b',
};

const btnDisabled = {
  opacity: '0.45',
  cursor: 'default',
};

const btnCasting = {
  borderColor: '#364fc7',
  boxShadow: '0 0 8px rgba(54, 79, 199, 0.4)',
};

const btnCooldown = {
  opacity: '0.55',
};

const castFillStyle = {
  position: 'absolute' as const,
  top: '0',
  left: '0',
  height: '100%',
  background: 'rgba(54, 79, 199, 0.35)',
  transition: 'width 0.1s linear',
  zIndex: 0,
};

const cooldownFillStyle = {
  position: 'absolute' as const,
  top: '0',
  right: '0',
  height: '100%',
  background: 'rgba(0, 0, 0, 0.4)',
  transition: 'width 0.5s linear',
  zIndex: 0,
};

const btnLabelStyle = {
  position: 'relative' as const,
  zIndex: 1,
};

const cooldownNumStyle = {
  position: 'absolute' as const,
  inset: '0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.85rem',
  fontWeight: 700 as const,
  color: '#e9ecef',
  textShadow: '0 0 4px rgba(0,0,0,0.9)',
  zIndex: 2,
};

</script>
