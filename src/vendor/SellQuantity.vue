<script setup lang="ts">
import { PhMinus, PhPlus } from '@phosphor-icons/vue';
import InlineConfirm from '../ledger/InlineConfirm.vue';
import { clampSellQuantity, parseSellQuantity } from './vendorModel';

// The Sell quantity stepper (plan 50-27): 1, minus, a number field, plus and All, drawn inside the
// inline confirmation so focus (Keep it first), Esc and Keep it follow the existing pattern. It only
// emits clamped quantities between 1 and the stack. The prompt and every name in it arrive as plain
// strings and reach the page as text nodes only.
const props = withDefaults(
  defineProps<{
    max: bigint;
    modelValue: bigint;
    prompt: string;
    confirmLabel: string;
    pending: boolean;
    mobile?: boolean;
    opener: HTMLElement | null;
  }>(),
  { mobile: false },
);
const emit = defineEmits<{ 'update:modelValue': [bigint]; confirm: []; keep: [] }>();

function set(value: bigint): void {
  emit('update:modelValue', clampSellQuantity(value, props.max));
}

function setOne(): void {
  set(1n);
}

function setAll(): void {
  set(props.max);
}

function stepDown(): void {
  if (props.modelValue <= 1n) return;
  set(props.modelValue - 1n);
}

function stepUp(): void {
  if (props.modelValue >= props.max) return;
  set(props.modelValue + 1n);
}

function onChange(event: Event): void {
  const field = event.target as HTMLInputElement;
  const parsed = parseSellQuantity(field.value);
  if (parsed === null) {
    field.value = String(props.modelValue);
    return;
  }
  const clamped = clampSellQuantity(parsed, props.max);
  field.value = String(clamped);
  emit('update:modelValue', clamped);
}
</script>

<template>
  <InlineConfirm
    :prompt="props.prompt"
    :confirm-label="props.confirmLabel"
    :pending="props.pending"
    :mobile="props.mobile"
    :opener="props.opener"
    @confirm="emit('confirm')"
    @keep="emit('keep')"
  >
    <span class="stepper" :class="{ mobile: props.mobile }" role="group" aria-label="How many to sell">
      <button type="button" class="btn btn-secondary step-btn" aria-label="Set to one" @click="setOne">1</button>
      <button
        type="button"
        class="btn btn-secondary step-btn"
        aria-label="One fewer"
        :aria-disabled="props.modelValue <= 1n ? 'true' : undefined"
        @click="stepDown"
      >
        <PhMinus :size="14" aria-hidden="true" />
      </button>
      <input
        type="text"
        inputmode="numeric"
        class="input qty-input"
        :value="String(props.modelValue)"
        :aria-label="'Quantity, 1 to ' + props.max"
        @change="onChange"
      />
      <button
        type="button"
        class="btn btn-secondary step-btn"
        aria-label="One more"
        :aria-disabled="props.modelValue >= props.max ? 'true' : undefined"
        @click="stepUp"
      >
        <PhPlus :size="14" aria-hidden="true" />
      </button>
      <button type="button" class="btn btn-secondary step-btn" :aria-label="`Set to all ${props.max}`" @click="setAll">
        All
      </button>
    </span>
  </InlineConfirm>
</template>

<style scoped>
.stepper {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.step-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 500;
}

.stepper.mobile .step-btn {
  min-width: 44px;
  min-height: 44px;
}

.qty-input {
  width: 64px;
  min-height: 32px;
  padding: 4px 8px;
  font-size: 12px;
  text-align: center;
}

.stepper.mobile .qty-input {
  min-height: 44px;
}

.step-btn[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}
</style>
