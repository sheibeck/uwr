<template>
  <div :style="containerStyle">
    <div
      v-for="enemy in enemies"
      :key="String(enemy.id)"
      :style="[rowStyle, enemy.isTarget ? targetRowStyle : {}]"
      @click="$emit('target-enemy', enemy.id)"
    >
      <!-- Name + Level + HP bar row -->
      <div :style="enemyMainRow">
        <div :style="[nameStyle, { color: conColor(enemy.conClass) }]">
          <span v-if="enemy.isBoss" :style="bossTagStyle">BOSS</span>
          {{ enemy.name }}
          <span :style="levelStyle">L{{ enemy.level }}</span>
        </div>
        <!-- HP bar -->
        <div :style="hpBarContainer">
          <div :style="[hpBarFill, { width: hpPercent(enemy) + '%', background: hpColor(enemy) }]" />
          <span :style="hpBarLabel">{{ enemy.hp }}/{{ enemy.maxHp }}</span>
        </div>
      </div>
      <!-- Effect tags -->
      <div v-if="enemy.effects && enemy.effects.length > 0" :style="effectTagContainerStyle">
        <span
          v-for="effect in sortedEffects(enemy.effects)"
          :key="String(effect.id)"
          :style="[effectTagBaseStyle, { color: effectTagColor(effect), borderColor: effectTagColor(effect) }]"
        >
          {{ effect.label.toUpperCase() }} {{ effect.seconds }}s
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
type EffectEntry = {
  id: bigint;
  label: string;
  seconds: number;
  isNegative: boolean;
  isOwn: boolean;
};

type EnemyEntry = {
  id: bigint;
  name: string;
  level: bigint;
  hp: bigint;
  maxHp: bigint;
  conClass: string;
  isTarget: boolean;
  isBoss: boolean;
  effects?: EffectEntry[];
};

defineProps<{
  enemies: EnemyEntry[];
}>();

defineEmits<{
  (e: 'target-enemy', enemyId: bigint): void;
}>();

const sortedEffects = (effects: EffectEntry[]): EffectEntry[] => {
  return [...effects].sort((a, b) => {
    // Own effects first
    if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;
    // Then by seconds descending
    return b.seconds - a.seconds;
  });
};

const effectTagColor = (effect: EffectEntry): string => {
  if (effect.isOwn) return '#ffd43b'; // yellow — player's own effects
  if (effect.isNegative) return '#ff6b6b'; // red — DoTs and debuffs
  return '#69db7c'; // green — HoTs and buffs
};

const conColorMap: Record<string, string> = {
  conRed: '#ff6b6b',
  conOrange: '#f08c00',
  conYellow: '#ffd43b',
  conWhite: '#e9ecef',
  conBlue: '#4dabf7',
  conLightGreen: '#69db7c',
  conGray: '#868e96',
};

const conColor = (conClass: string) => conColorMap[conClass] ?? '#e9ecef';

const hpPercent = (enemy: EnemyEntry) => {
  const max = Number(enemy.maxHp);
  if (max <= 0) return 0;
  return Math.round((Number(enemy.hp) / max) * 100);
};

const hpColor = (enemy: EnemyEntry) => {
  const pct = hpPercent(enemy) / 100;
  if (pct > 0.5) return '#69db7c';
  if (pct > 0.25) return '#ffd43b';
  return '#ff6b6b';
};

const containerStyle = {
  padding: '4px 12px 2px',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '2px',
};

const rowStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  padding: '2px 6px',
  borderRadius: '3px',
  cursor: 'pointer',
  border: '1px solid transparent',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  minHeight: '24px',
};

const enemyMainRow = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const targetRowStyle = {
  border: '1px solid #ffd43b',
  boxShadow: '0 0 6px rgba(255, 212, 59, 0.4), inset 0 0 4px rgba(255, 212, 59, 0.1)',
  background: 'rgba(255, 212, 59, 0.06)',
};

const nameStyle = {
  fontSize: '0.72rem',
  fontWeight: 600 as const,
  whiteSpace: 'nowrap' as const,
  minWidth: '80px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
};

const levelStyle = {
  opacity: 0.6,
  fontSize: '0.65rem',
  fontWeight: 400 as const,
};

const bossTagStyle = {
  background: '#c92a2a',
  color: '#fff',
  fontSize: '0.55rem',
  padding: '0 3px',
  borderRadius: '2px',
  fontWeight: 700 as const,
  letterSpacing: '0.5px',
};

const hpBarContainer = {
  flex: '1',
  height: '14px',
  background: '#1a1a2e',
  borderRadius: '2px',
  position: 'relative' as const,
  overflow: 'hidden',
  minWidth: '60px',
};

const hpBarFill = {
  position: 'absolute' as const,
  top: '0',
  left: '0',
  height: '100%',
  borderRadius: '2px',
  transition: 'width 0.3s ease',
};

const hpBarLabel = {
  position: 'absolute' as const,
  inset: '0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.6rem',
  color: '#e9ecef',
  fontWeight: 600 as const,
  textShadow: '0 0 3px rgba(0,0,0,0.8)',
};

const effectTagContainerStyle = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: '3px',
  marginTop: '2px',
  maxWidth: '100%',
};

const effectTagBaseStyle = {
  fontSize: '0.6rem',
  fontWeight: 600,
  padding: '1px 4px',
  borderRadius: '3px',
  border: '1px solid',
  lineHeight: '1.2',
  whiteSpace: 'nowrap' as const,
};
</script>
