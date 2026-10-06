// Rounds cooldown view for hotbar slots in combat (48-UI-SPEC "Rounds on cooldowns", CMB-04/06).
//
// In combat a slot cools by ability_cooldown.roundsRemaining. The sweep total comes from the
// ability's own cooldownSeconds (CONTEXT "Engine-driven fixes"): the server rewrites the row's
// wall-clock estimate every round, so it can never give a stable total. The conversion
// constants come from the server module so both sides agree.
import { EFFECT_ROUND_CONVERSION_MICROS, MIN_EFFECT_ROUNDS } from '@game-data/combat_constants';

export interface RoundCooldownView {
  cooling: boolean;
  rounds: bigint;
  totalRounds: bigint;
  /** roundsRemaining / totalRounds, 0..1; 0 when not cooling. */
  fraction: number;
  /** '1 round' or '{n} rounds'; empty when not cooling. */
  text: string;
  /** ', ready in {n} rounds' appended to the slot label; empty when not cooling. */
  ariaSuffix: string;
}

/** Whole rounds an ability's cooldown lasts: ceil(seconds / 4 s), at least MIN_EFFECT_ROUNDS. */
export function cooldownTotalRounds(cooldownSeconds: bigint): bigint {
  const micros = cooldownSeconds * 1_000_000n;
  const rounds = (micros + EFFECT_ROUND_CONVERSION_MICROS - 1n) / EFFECT_ROUND_CONVERSION_MICROS;
  return rounds > MIN_EFFECT_ROUNDS ? rounds : MIN_EFFECT_ROUNDS;
}

export function roundsText(n: bigint): string {
  return n === 1n ? '1 round' : `${n} rounds`;
}

export function roundCooldownView(
  row: { roundsRemaining: bigint } | undefined,
  ability: { cooldownSeconds: bigint },
): RoundCooldownView {
  if (row === undefined || row.roundsRemaining <= 0n) {
    return { cooling: false, rounds: 0n, totalRounds: 0n, fraction: 0, text: '', ariaSuffix: '' };
  }
  const rounds = row.roundsRemaining;
  const own = cooldownTotalRounds(ability.cooldownSeconds);
  const totalRounds = rounds > own ? rounds : own;
  const text = roundsText(rounds);
  return {
    cooling: true,
    rounds,
    totalRounds,
    fraction: Number(rounds) / Number(totalRounds),
    text,
    ariaSuffix: `, ready in ${text}`,
  };
}
