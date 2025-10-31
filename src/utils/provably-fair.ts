import crypto from 'node:crypto';

export function generateServerSeed(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashServerSeed(serverSeed: string): string {
  return crypto.createHash('sha256').update(serverSeed).digest('hex');
}

export function calculateCrashPoint(serverSeed: string, houseEdge = 0.01): number {
  const hash = crypto.createHash('sha256').update(serverSeed).digest('hex');

  const hexSubstring = hash.substring(0, 13);
  const intValue = Number.parseInt(hexSubstring, 16);

  const maxValue = 0xfffffffffffff;

  const r = intValue / maxValue;

  if (r < 0.03) {
    return 1.0;
  }

  const maxCrashPoint = 10;
  const normalizedR = (r - 0.03) / 0.97;

  const crashPoint = 1 / (1 - normalizedR * (1 - 1 / maxCrashPoint));

  const adjustedCrashPoint = crashPoint * (1 - houseEdge);

  const cappedCrashPoint = Math.min(Math.max(1.0, adjustedCrashPoint), maxCrashPoint);

  return Math.floor(cappedCrashPoint * 100) / 100;
}

export function verifyCrashPoint(
  serverSeed: string,
  crashPoint: number,
  houseEdge = 0.01
): boolean {
  const calculatedCrashPoint = calculateCrashPoint(serverSeed, houseEdge);
  return Math.abs(calculatedCrashPoint - crashPoint) < 0.01;
}

export function verifyHash(serverSeed: string, serverSeedHash: string): boolean {
  const calculatedHash = hashServerSeed(serverSeed);
  return calculatedHash === serverSeedHash;
}

export function generateGameSeeds(houseEdge = 0.01): {
  serverSeed: string;
  serverSeedHash: string;
  crashPoint: number;
} {
  const serverSeed = generateServerSeed();
  const serverSeedHash = hashServerSeed(serverSeed);
  const crashPoint = calculateCrashPoint(serverSeed, houseEdge);

  return {
    serverSeed,
    serverSeedHash,
    crashPoint,
  };
}

export function calculateMultiplier(elapsedMs: number): number {
  const growthRate = 0.00006;
  const multiplier = 1.0 + elapsedMs * growthRate;
  return Math.floor(multiplier * 100) / 100;
}

export function calculateTimeToMultiplier(targetMultiplier: number): number {
  const growthRate = 0.00006;
  return Math.log(targetMultiplier) / growthRate;
}
