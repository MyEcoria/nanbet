const MIN_PROBABILITY = 0.01;
const MAX_PROBABILITY = 0.99;

// House margin taken off the fair odds derived from Polymarket's probability,
// expressed as a whole percentage (e.g. 10 = 10% cut off every payout).
const ODDS_MARGIN_PERCENT = Number(process.env.ODDS_MARGIN_PERCENT ?? 10);

export function probabilityToOdds(probability: number): number {
  const clamped = Math.min(MAX_PROBABILITY, Math.max(MIN_PROBABILITY, probability));
  const fairOdds = 1 / clamped;
  const oddsWithMargin = fairOdds * (1 - ODDS_MARGIN_PERCENT / 100);
  return Math.round(oddsWithMargin * 10000) / 10000;
}
