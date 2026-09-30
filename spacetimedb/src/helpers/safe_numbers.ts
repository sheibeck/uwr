/**
 * Crash-proof numeric conversion for untrusted (model-supplied) values.
 *
 * BigInt(1.5), BigInt(NaN) and BigInt(Infinity) all throw, and a throw inside an
 * apply function rolls back the whole transaction. Every model-supplied number
 * that becomes a bigint column goes through toBigIntSafe instead.
 *
 * Pure module: no schema, events or server-entry imports.
 */

/**
 * Convert an unknown value to a bigint inside [min, max].
 * - bigint: clamped.
 * - finite number, or a non-blank numeric string: floored, then clamped.
 * - anything else (NaN, Infinity, null, undefined, objects, non-numeric strings): `fallback`, unclamped.
 * Never throws.
 */
export function toBigIntSafe(
  value: unknown,
  opts: { min: bigint; max: bigint; fallback: bigint },
): bigint {
  const { min, max, fallback } = opts;
  const clamp = (n: bigint): bigint => (n < min ? min : n > max ? max : n);
  if (typeof value === 'bigint') return clamp(value);
  const n = toFiniteNumber(value);
  if (n === null) return fallback;
  return clamp(BigInt(Math.floor(n)));
}

/**
 * Convert an unknown value to an integer inside [min, max]. Same rules as
 * toBigIntSafe, in number space. A bigint input is converted with Number().
 * Never throws.
 */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'bigint' ? Number(value) : toFiniteNumber(value);
  if (n === null || !Number.isFinite(n)) return fallback;
  const floored = Math.floor(n);
  return floored < min ? min : floored > max ? max : floored;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    if (value.trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
