export type TimedEffectLike = {
  id: bigint;
  effectType: string;
  roundsRemaining: bigint;
  magnitude?: bigint;
  sourceAbility?: string;
};

export type EffectTimerEntry = {
  seenAtMicros: number;
  rounds: bigint;
  tickSeconds: number;
};

export const DEFAULT_NEGATIVE_EFFECT_TYPES = new Set([
  'damage_down',
  'dot',
  'skip',
  'slow',
  'weaken',
]);

export const effectTickSeconds = (effectType: string) =>
  effectType === 'regen' || effectType === 'dot' ? 3 : 10;

export const effectLabel = (
  effect: Pick<TimedEffectLike, 'effectType' | 'sourceAbility'>,
  labelOverrides?: Record<string, string>
) => {
  if (effect.sourceAbility) return effect.sourceAbility;
  const override = labelOverrides?.[effect.effectType];
  if (override) return override;
  return effect.effectType.replace(/_/g, ' ');
};

export const effectIsNegative = (
  effect: Pick<TimedEffectLike, 'effectType' | 'magnitude'>,
  negativeTypes: Set<string> = DEFAULT_NEGATIVE_EFFECT_TYPES
) => {
  return negativeTypes.has(effect.effectType) || (effect.magnitude ?? 0n) < 0n;
};

export const effectRemainingSeconds = (
  effect: Pick<TimedEffectLike, 'id' | 'effectType' | 'roundsRemaining'>,
  nowMicros: number,
  timerStore: Map<string, EffectTimerEntry>
) => {
  const tickSeconds = effectTickSeconds(effect.effectType);
  const key = effect.id.toString();
  const existing = timerStore.get(key);
  if (!existing || existing.rounds !== effect.roundsRemaining || existing.tickSeconds !== tickSeconds) {
    timerStore.set(key, {
      seenAtMicros: nowMicros,
      rounds: effect.roundsRemaining,
      tickSeconds,
    });
  }
  const entry = timerStore.get(key);
  const totalSeconds = Number(effect.roundsRemaining) * tickSeconds;
  const elapsedSeconds = entry ? (nowMicros - entry.seenAtMicros) / 1_000_000 : 0;
  return Math.max(0, Math.ceil(totalSeconds - elapsedSeconds));
};
