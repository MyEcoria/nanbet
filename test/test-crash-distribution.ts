import { ProvablyFairGenerator } from '../src/utils/provably-fair';

interface Stats {
  total: number;
  min: number;
  max: number;
  average: number;
  median: number;
  distribution: {
    '1.0x (instant crash)': number;
    '1.0x-1.5x': number;
    '1.5x-2.0x': number;
    '2.0x-3.0x': number;
    '3.0x-5.0x': number;
    '5.0x-7.0x': number;
    '7.0x-10.0x': number;
  };
}

function analyzeDistribution(crashPoints: number[]): Stats {
  const sorted = [...crashPoints].sort((a, b) => a - b);

  const stats: Stats = {
    total: crashPoints.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    average: crashPoints.reduce((sum, val) => sum + val, 0) / crashPoints.length,
    median: sorted[Math.floor(sorted.length / 2)],
    distribution: {
      '1.0x (instant crash)': 0,
      '1.0x-1.5x': 0,
      '1.5x-2.0x': 0,
      '2.0x-3.0x': 0,
      '3.0x-5.0x': 0,
      '5.0x-7.0x': 0,
      '7.0x-10.0x': 0,
    },
  };

  for (const point of crashPoints) {
    if (point === 1.0) {
      stats.distribution['1.0x (instant crash)']++;
    } else if (point < 1.5) {
      stats.distribution['1.0x-1.5x']++;
    } else if (point < 2.0) {
      stats.distribution['1.5x-2.0x']++;
    } else if (point < 3.0) {
      stats.distribution['2.0x-3.0x']++;
    } else if (point < 5.0) {
      stats.distribution['3.0x-5.0x']++;
    } else if (point < 7.0) {
      stats.distribution['5.0x-7.0x']++;
    } else {
      stats.distribution['7.0x-10.0x']++;
    }
  }

  return stats;
}

function formatPercentage(value: number, total: number): string {
  const percentage = (value / total) * 100;
  return `${percentage.toFixed(2)}%`;
}

function printStats(stats: Stats): void {
  console.log('\n=== CRASH GAME - PROVABLY FAIR DISTRIBUTION ANALYSIS ===\n');

  console.log(`Total games generated: ${stats.total.toLocaleString()}`);
  console.log(`Minimum crash point: ${stats.min.toFixed(2)}x`);
  console.log(`Maximum crash point: ${stats.max.toFixed(2)}x`);
  console.log(`Average crash point: ${stats.average.toFixed(2)}x`);
  console.log(`Median crash point: ${stats.median.toFixed(2)}x`);

  console.log('\n=== DISTRIBUTION BY RANGE ===\n');

  const ranges = Object.entries(stats.distribution);
  for (const [range, count] of ranges) {
    const percentage = formatPercentage(count, stats.total);
    const bar = '█'.repeat(Math.floor((count / stats.total) * 50));
    console.log(
      `${range.padEnd(25)} | ${count.toString().padStart(7)} (${percentage.padStart(7)}) ${bar}`
    );
  }

  console.log('\n=== HOUSE EDGE VERIFICATION ===\n');

  // Calculate expected house edge
  // House edge = 1 - (average payout / 1)
  const expectedReturn = stats.average;
  const houseEdge = (1 - 1 / expectedReturn) * 100;
  console.log(`Expected return: ${expectedReturn.toFixed(4)}x`);
  console.log(`Calculated house edge: ${houseEdge.toFixed(2)}%`);
  console.log(`Configured house edge: 1.00%`);

  console.log('\n=== RARITY ANALYSIS ===\n');

  const above5x = stats.distribution['5.0x-7.0x'] + stats.distribution['7.0x-10.0x'];
  const above7x = stats.distribution['7.0x-10.0x'];

  console.log(
    `Crash points above 5.0x: ${above5x.toLocaleString()} (${formatPercentage(above5x, stats.total)})`
  );
  console.log(
    `Crash points above 7.0x: ${above7x.toLocaleString()} (${formatPercentage(above7x, stats.total)})`
  );

  console.log('\n========================================================\n');
}

async function main() {
  console.log('Generating 100,000 provably fair crash points...');
  console.log('This may take a few seconds...\n');

  const startTime = Date.now();
  const crashPoints: number[] = [];

  for (let i = 0; i < 1000000; i++) {
    const { crashPoint } = ProvablyFairGenerator.generateGameSeeds(0.01);
    crashPoints.push(crashPoint);

    if ((i + 1) % 10000 === 0) {
      console.log(`Progress: ${((i + 1) / 1000).toFixed(0)}k / 100k`);
    }
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`\nGeneration completed in ${duration}s`);

  const stats = analyzeDistribution(crashPoints);
  printStats(stats);
}

main().catch(console.error);
