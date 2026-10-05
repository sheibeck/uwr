// Bar math shared by the desktop vitals rail and the mobile vitals strip (45-UI-SPEC "Vitals rail").
// Values arrive as bigint from the character row; Number() is used here for math and display only.

/** Fill fraction of a bar: clamp(value / max, 0, 1); 0 when max is not positive. */
export function barFraction(value: bigint | number, max: bigint | number): number {
  const m = Number(max);
  if (!(m > 0)) return 0;
  const fraction = Number(value) / m;
  if (!Number.isFinite(fraction)) return 0;
  return Math.min(1, Math.max(0, fraction));
}

/** Readout text: '212 / 260'; '0 / 0' when max is not positive. */
export function vitalText(value: bigint | number, max: bigint | number): string {
  if (!(Number(max) > 0)) return '0 / 0';
  return `${Number(value)} / ${Number(max)}`;
}
