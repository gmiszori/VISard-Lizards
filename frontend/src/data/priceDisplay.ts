export type PriceTier = 'student' | 'worker' | 'external';

const FALLBACK_ORDER: PriceTier[] = ['student', 'worker', 'external'];

/**
 * Which price to show for the chosen tier. When the source publishes no price for that tier but does for
 * another one, the other one is shown and `tier` says which, so the label never claims a price it is not.
 * `tier` is null when no tier has a price.
 */
export function pickPrice(prices: Record<PriceTier, number | null | undefined>, wanted: PriceTier): { tier: PriceTier | null; value: number | null } {
  for (const tier of [wanted, ...FALLBACK_ORDER.filter(t => t !== wanted)]) {
    const value = prices[tier];
    if (typeof value === 'number' && Number.isFinite(value)) return { tier, value };
  }
  return { tier: null, value: null };
}
