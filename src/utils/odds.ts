const MIN_PROBABILITY = 0.01;
const MAX_PROBABILITY = 0.99;

export function probabilityToOdds(probability: number): number {
  const clamped = Math.min(MAX_PROBABILITY, Math.max(MIN_PROBABILITY, probability));
  return Math.round((1 / clamped) * 10000) / 10000;
}
