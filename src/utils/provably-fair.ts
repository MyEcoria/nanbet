import crypto from 'node:crypto';

export class ProvablyFairGenerator {
  public static generateServerSeed(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  
  public static hashServerSeed(serverSeed: string): string {
    return crypto.createHash('sha256').update(serverSeed).digest('hex');
  }

  
  public static calculateCrashPoint(serverSeed: string, houseEdge = 0.01): number {

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

  
  public static verifyCrashPoint(
    serverSeed: string,
    crashPoint: number,
    houseEdge = 0.01
  ): boolean {
    const calculatedCrashPoint = ProvablyFairGenerator.calculateCrashPoint(serverSeed, houseEdge);
    return Math.abs(calculatedCrashPoint - crashPoint) < 0.01;
  }

  
  public static verifyHash(serverSeed: string, serverSeedHash: string): boolean {
    const calculatedHash = ProvablyFairGenerator.hashServerSeed(serverSeed);
    return calculatedHash === serverSeedHash;
  }

  
  public static generateGameSeeds(houseEdge = 0.01): {
    serverSeed: string;
    serverSeedHash: string;
    crashPoint: number;
  } {
    const serverSeed = ProvablyFairGenerator.generateServerSeed();
    const serverSeedHash = ProvablyFairGenerator.hashServerSeed(serverSeed);
    const crashPoint = ProvablyFairGenerator.calculateCrashPoint(serverSeed, houseEdge);

    return {
      serverSeed,
      serverSeedHash,
      crashPoint,
    };
  }
}


export function calculateMultiplier(elapsedMs: number): number {
  
  
  const growthRate = 0.00006;

  
  const multiplier = Math.E ** (growthRate * elapsedMs);

  
  return Math.floor(multiplier * 100) / 100;
}


export function calculateTimeToMultiplier(targetMultiplier: number): number {
  const growthRate = 0.00006;
  return Math.log(targetMultiplier) / growthRate;
}
