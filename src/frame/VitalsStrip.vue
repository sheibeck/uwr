<script setup lang="ts">
import { PhArrowFatUp } from '@phosphor-icons/vue';
import { barFraction } from './vitals';

const props = defineProps<{
  name: string;
  avatarInitial: string;
  classLine: string;
  hp: bigint;
  maxHp: bigint;
  mana: bigint;
  maxMana: bigint;
  stamina: bigint;
  maxStamina: bigint;
  levelUp: boolean;
  newSkill: boolean;
  compact?: boolean;
}>();
</script>

<template>
  <section class="vitals-strip" aria-label="Vitals">
    <template v-if="props.compact">
      <div class="compact-row">
        <div class="name" :title="props.name">{{ props.name }}</div>
        <div class="compact-bar">
          <div class="track" role="progressbar" aria-label="Health" aria-valuemin="0" :aria-valuenow="Number(props.hp)" :aria-valuemax="Number(props.maxHp)">
            <div class="fill fill-health" :style="{ width: `${barFraction(props.hp, props.maxHp) * 100}%` }"></div>
          </div>
        </div>
        <div class="compact-bar">
          <div class="track" role="progressbar" aria-label="Mana" aria-valuemin="0" :aria-valuenow="Number(props.mana)" :aria-valuemax="Number(props.maxMana)">
            <div class="fill fill-mana" :style="{ width: `${barFraction(props.mana, props.maxMana) * 100}%` }"></div>
          </div>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="identity-row">
        <div class="avatar" aria-hidden="true">{{ props.avatarInitial }}</div>
        <div class="identity-text">
          <div class="name" :title="props.name">{{ props.name }}</div>
          <div class="class-line">{{ props.classLine }}</div>
        </div>
        <div class="tags">
          <span v-if="props.levelUp" class="tag tag-outline"><PhArrowFatUp :size="12" aria-hidden="true" />Level up</span>
          <span v-if="props.newSkill" class="tag tag-accent">New skill</span>
        </div>
      </div>
      <div class="bars-row">
        <div class="cell">
          <span class="micro-label">HP {{ Number(props.hp) }}</span>
          <div class="track" role="progressbar" aria-label="Health" aria-valuemin="0" :aria-valuenow="Number(props.hp)" :aria-valuemax="Number(props.maxHp)">
            <div class="fill fill-health" :style="{ width: `${barFraction(props.hp, props.maxHp) * 100}%` }"></div>
          </div>
        </div>
        <div class="cell">
          <span class="micro-label">MP {{ Number(props.mana) }}</span>
          <div class="track" role="progressbar" aria-label="Mana" aria-valuemin="0" :aria-valuenow="Number(props.mana)" :aria-valuemax="Number(props.maxMana)">
            <div class="fill fill-mana" :style="{ width: `${barFraction(props.mana, props.maxMana) * 100}%` }"></div>
          </div>
        </div>
        <div class="cell">
          <span class="micro-label">SP {{ Number(props.stamina) }}</span>
          <div class="track" role="progressbar" aria-label="Stamina" aria-valuemin="0" :aria-valuenow="Number(props.stamina)" :aria-valuemax="Number(props.maxStamina)">
            <div class="fill fill-stamina" :style="{ width: `${barFraction(props.stamina, props.maxStamina) * 100}%` }"></div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.vitals-strip {
  padding: 16px 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: color-mix(in srgb, var(--color-surface) 55%, transparent);
}

.identity-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.avatar {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: var(--color-accent-900);
  box-shadow: inset 0 0 0 1px var(--color-accent-700);
  color: var(--color-accent-300);
  font-size: 20px;
  font-weight: 500;
}

.identity-text {
  min-width: 0;
  flex: 1 1 auto;
}

.name {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.class-line {
  font-size: 12px;
  color: var(--color-neutral-400);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* One tag row high: when space runs out the New skill tag wraps away first (clipped), the name never wraps. */
.tags {
  margin-left: auto;
  flex: 0 1 auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  max-height: 24px;
}

.tags .tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.bars-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.micro-label {
  font-size: 10px;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}

.track {
  height: 4px;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
  overflow: hidden;
}

.fill {
  height: 100%;
}

.fill-health {
  background: var(--color-health);
}

.fill-mana {
  background: var(--color-mana);
}

.fill-stamina {
  background: var(--color-stamina);
}

.compact-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.compact-row .name {
  flex: 0 1 auto;
  max-width: 50%;
}

.compact-bar {
  flex: 1;
  min-width: 0;
}
</style>
