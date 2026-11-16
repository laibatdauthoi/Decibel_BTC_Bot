/** Small numeric helpers shared by the strategy modules (2026-11-16). */

/** Limits `value` to the range [minimum, maximum]. */
export function clampNumberV1(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
