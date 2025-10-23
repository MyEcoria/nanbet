import type { Server as SocketIOServer } from 'socket.io';
import { sequelize } from '../config/database';
import wallets from '../config/wallets';
import { CrashBet } from '../models/CrashBet.model';
import { CrashGame } from '../models/CrashGame.model';
import { User } from '../models/User.model';
import type {
  ActiveBet,
  CrashGameConfig,
  GameCrashedData,
  GameHistoryItem,
  GameStartedData,
  GameStartingData,
  GameStateData,
  GameTickData,
} from '../types/crash.types';
import { logger } from '../utils/logger';
import {
  calculateMultiplier,
  calculateTimeToMultiplier,
  ProvablyFairGenerator,
} from '../utils/provably-fair';

export class CrashGameService {
  private io: SocketIOServer;
  private currentGame: CrashGame | null = null;
  private gameTimer: NodeJS.Timeout | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private gameStartTime: number = 0;
  private config: CrashGameConfig;

  
  private betAttempts: Map<string, number[]> = new Map();
  private cashOutAttempts: Map<string, number[]> = new Map();

  constructor(io: SocketIOServer, config?: Partial<CrashGameConfig>) {
    this.io = io;
    this.config = {
      bettingDuration: 10, 
      minBet: 0,
      maxBet: 1000,
      maxProfit: 10000,
      tickRate: 100, 
      minCrashPoint: 1.0,
      maxCrashPoint: 1000000,
      houseEdge: 0.01, 
      ...config,
    };
  }

  
  public async start(): Promise<void> {
    logger.info('[Crash] Starting crash game service');
    await this.startNewGame();
  }

  
  public stop(): void {
    logger.info('[Crash] Stopping crash game service');
    if (this.gameTimer) clearTimeout(this.gameTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
  }

  
  private async startNewGame(): Promise<void> {
    try {
      
      const { serverSeed, serverSeedHash, crashPoint } = ProvablyFairGenerator.generateGameSeeds(
        this.config.houseEdge
      );

      
      const lastGame = await CrashGame.findOne({
        order: [['gameNumber', 'DESC']],
      });
      const gameNumber = lastGame?.gameNumber ? lastGame.gameNumber + 1 : 1;

      
      this.currentGame = await CrashGame.create({
        gameNumber,
        serverSeed,
        serverSeedHash,
        crashPoint,
        status: 'betting',
      });

      logger.info(`[Crash] New game created`, {
        gameId: this.currentGame.id,
        gameNumber: this.currentGame.gameNumber,
        crashPoint: this.currentGame.crashPoint,
      });

      
      const startingData: GameStartingData = {
        gameId: this.currentGame.id,
        gameNumber: this.currentGame.gameNumber,
        serverSeedHash: this.currentGame.serverSeedHash,
        bettingDuration: this.config.bettingDuration,
      };
      this.io.emit('game:starting', startingData);

      
      this.gameTimer = setTimeout(() => {
        this.runGame().catch((error) => {
          logger.error('[Crash] Error running game', { error });
        });
      }, this.config.bettingDuration * 1000);
    } catch (error) {
      logger.error('[Crash] Error starting new game', { error });
      
      setTimeout(() => this.startNewGame(), 5000);
    }
  }

  
  private async runGame(): Promise<void> {
    if (!this.currentGame) {
      logger.error('[Crash] No current game to run');
      return;
    }

    try {
      
      await this.currentGame.update({
        status: 'running',
        startedAt: new Date(),
      });

      this.gameStartTime = Date.now();

      logger.info(`[Crash] Game started`, {
        gameId: this.currentGame.id,
        gameNumber: this.currentGame.gameNumber,
      });

      
      const startedData: GameStartedData = {
        gameId: this.currentGame.id,
        gameNumber: this.currentGame.gameNumber,
        startTime: this.gameStartTime,
      };
      this.io.emit('game:started', startedData);

      
      await CrashBet.update(
        { status: 'playing' },
        {
          where: {
            gameId: this.currentGame.id,
            status: 'pending',
          },
        }
      );

      
      this.startGameTick();

      
      const crashTime = calculateTimeToMultiplier(this.currentGame.crashPoint);

      
      this.gameTimer = setTimeout(() => {
        this.crashGame().catch((error) => {
          logger.error('[Crash] Error crashing game', { error });
        });
      }, crashTime);
    } catch (error) {
      logger.error('[Crash] Error in runGame', { error });
      await this.crashGame();
    }
  }

  
  private startGameTick(): void {
    this.tickTimer = setInterval(() => {
      if (!this.currentGame || this.currentGame.status !== 'running') {
        if (this.tickTimer) clearInterval(this.tickTimer);
        return;
      }

      const timeElapsed = Date.now() - this.gameStartTime;
      const currentMultiplier = calculateMultiplier(timeElapsed);

      const tickData: GameTickData = {
        gameId: this.currentGame.id,
        currentMultiplier,
        timeElapsed,
      };

      this.io.emit('game:tick', tickData);
    }, this.config.tickRate);
  }

  
  private async crashGame(): Promise<void> {
    if (!this.currentGame) {
      logger.error('[Crash] No current game to crash');
      return;
    }

    try {
      
      if (this.tickTimer) {
        clearInterval(this.tickTimer);
        this.tickTimer = null;
      }

      
      await this.currentGame.update({
        status: 'crashed',
        crashedAt: new Date(),
      });

      logger.info(`[Crash] Game crashed`, {
        gameId: this.currentGame.id,
        gameNumber: this.currentGame.gameNumber,
        crashPoint: this.currentGame.crashPoint,
      });

      
      await CrashBet.update(
        {
          status: 'lost',
          profit: sequelize.literal('-betAmount'),
        },
        {
          where: {
            gameId: this.currentGame.id,
            status: 'playing',
          },
        }
      );

      
      const crashedData: GameCrashedData = {
        gameId: this.currentGame.id,
        gameNumber: this.currentGame.gameNumber,
        crashPoint: this.currentGame.crashPoint,
        serverSeed: this.currentGame.serverSeed,
        serverSeedHash: this.currentGame.serverSeedHash,
      };
      this.io.emit('game:crashed', crashedData);

      
      this.gameTimer = setTimeout(() => {
        this.startNewGame().catch((error) => {
          logger.error('[Crash] Error starting new game after crash', { error });
        });
      }, 3000);
    } catch (error) {
      logger.error('[Crash] Error in crashGame', { error });
      
      setTimeout(() => this.startNewGame(), 5000);
    }
  }

  
  public async placeBet(
    userId: string,
    amount: number,
    currency: string
  ): Promise<{ success: boolean; betId?: string; error?: string; code?: string }> {
    
    if (!this.checkRateLimit(userId, 'bet')) {
      return {
        success: false,
        error: 'Too many bet attempts. Please wait.',
        code: 'RATE_LIMIT',
      };
    }

    
    if (!this.currentGame || this.currentGame.status !== 'betting') {
      return {
        success: false,
        error: 'Betting is not available right now',
        code: 'BETTING_CLOSED',
      };
    }

    
    const gameId = this.currentGame.id;

    if (!wallets[currency as keyof typeof wallets]) {
      return {
        success: false,
        error: 'Invalid currency',
        code: 'INVALID_CURRENCY',
      };
    }

    if (amount > this.config.maxBet) {
      return {
        success: false,
        error: `Maximum bet is ${this.config.maxBet}`,
        code: 'BET_TOO_HIGH',
      };
    }

    try {
      
      const existingBet = await CrashBet.findOne({
        where: {
          userId,
          gameId,
        },
      });

      if (existingBet) {
        return {
          success: false,
          error: 'You already have a bet in this game',
          code: 'BET_ALREADY_PLACED',
        };
      }

      
      const result = await sequelize.transaction(async (t) => {
        
        const user = await User.findByPk(userId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!user) {
          throw new Error('User not found');
        }

        
        const balanceField = `balance${currency}` as keyof User;
        const currentBalance = parseFloat(String(user[balanceField] ?? 0));

        if (currentBalance < amount) {
          throw new Error('Insufficient balance');
        }

        
        const newBalance = currentBalance - amount;
        await user.update({ [balanceField]: newBalance }, { transaction: t });

        
        const bet = await CrashBet.create(
          {
            userId,
            gameId,
            currency,
            betAmount: amount,
            status: 'pending',
          },
          { transaction: t }
        );

        return { bet, user };
      });

      logger.info('[Crash] Bet placed', {
        userId,
        betId: result.bet.id,
        amount,
        currency,
        gameId,
      });


      this.io.emit('bet:placed', {
        betId: result.bet.id,
        userId,
        amount,
        currency,
      });


      this.io.to(`user:${userId}`).emit('balance:update', {
        balanceXNO: parseFloat(String(result.user.balanceXNO)),
        balanceBAN: parseFloat(String(result.user.balanceBAN)),
        balanceXRO: parseFloat(String(result.user.balanceXRO)),
        balanceANA: parseFloat(String(result.user.balanceANA)),
        balanceXDG: parseFloat(String(result.user.balanceXDG)),
        balanceNANUSD: parseFloat(String(result.user.balanceNANUSD)),
      });

      // Send bet notification
      this.io.to(`user:${userId}`).emit('notification', {
        type: 'bet',
        message: `Bet placed: ${amount} ${currency}`,
        amount,
        currency,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        betId: result.bet.id,
      };
    } catch (error) {
      logger.error('[Crash] Error placing bet', { error, userId, amount, currency });

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage === 'Insufficient balance') {
        return {
          success: false,
          error: errorMessage,
          code: 'INSUFFICIENT_BALANCE',
        };
      }

      return {
        success: false,
        error: 'Failed to place bet',
        code: 'INTERNAL_ERROR',
      };
    }
  }

  
  public async cashOut(userId: string): Promise<{
    success: boolean;
    profit?: number;
    cashOutAt?: number;
    error?: string;
    code?: string;
  }> {
    
    if (!this.checkRateLimit(userId, 'cashout')) {
      return {
        success: false,
        error: 'Too many cashout attempts. Please wait.',
        code: 'RATE_LIMIT',
      };
    }

    
    if (!this.currentGame || this.currentGame.status !== 'running') {
      return {
        success: false,
        error: 'No game is currently running',
        code: 'NO_GAME_RUNNING',
      };
    }

    
    const gameId = this.currentGame.id;

    try {
      
      const timeElapsed = Date.now() - this.gameStartTime;
      const currentMultiplier = calculateMultiplier(timeElapsed);

      
      const result = await sequelize.transaction(async (t) => {
        
        const bet = await CrashBet.findOne({
          where: {
            userId,
            gameId,
            status: 'playing',
          },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!bet) {
          throw new Error('No active bet found');
        }

        
        const profit = parseFloat(String(bet.betAmount)) * (currentMultiplier - 1);

        
        if (profit > this.config.maxProfit) {
          throw new Error('Profit exceeds maximum allowed');
        }

        
        await bet.update(
          {
            status: 'cashed_out',
            cashOutAt: currentMultiplier,
            profit,
            cashOutTime: new Date(),
          },
          { transaction: t }
        );

        
        const user = await User.findByPk(userId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!user) {
          throw new Error('User not found');
        }

        const balanceField = `balance${bet.currency}` as keyof User;
        const currentBalance = parseFloat(String(user[balanceField] ?? 0));
        const payout = parseFloat(String(bet.betAmount)) + profit;
        const newBalance = currentBalance + payout;

        await user.update({ [balanceField]: newBalance }, { transaction: t });

        
        await user.reload({ transaction: t });

        return { bet, profit, user };
      });

      logger.info('[Crash] Cashout successful', {
        userId,
        betId: result.bet.id,
        cashOutAt: currentMultiplier,
        profit: result.profit,
      });


      this.io.emit('bet:cashout', {
        betId: result.bet.id,
        userId,
        cashOutAt: currentMultiplier,
        profit: result.profit,
        currency: result.bet.currency,
      });


      this.io.to(`user:${userId}`).emit('balance:update', {
        balanceXNO: parseFloat(String(result.user.balanceXNO)),
        balanceBAN: parseFloat(String(result.user.balanceBAN)),
        balanceXRO: parseFloat(String(result.user.balanceXRO)),
        balanceANA: parseFloat(String(result.user.balanceANA)),
        balanceXDG: parseFloat(String(result.user.balanceXDG)),
        balanceNANUSD: parseFloat(String(result.user.balanceNANUSD)),
      });

      // Send cashout notification
      const payout = parseFloat(String(result.bet.betAmount)) + result.profit;
      this.io.to(`user:${userId}`).emit('notification', {
        type: 'cashout',
        message: `Cashed out at ${currentMultiplier.toFixed(2)}x - Won ${payout.toFixed(2)} ${result.bet.currency}`,
        amount: payout,
        currency: result.bet.currency,
        multiplier: currentMultiplier,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        profit: result.profit,
        cashOutAt: currentMultiplier,
      };
    } catch (error) {
      logger.error('[Crash] Error cashing out', { error, userId });

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage === 'No active bet found') {
        return {
          success: false,
          error: errorMessage,
          code: 'NO_ACTIVE_BET',
        };
      }

      return {
        success: false,
        error: 'Failed to cash out',
        code: 'INTERNAL_ERROR',
      };
    }
  }


  public async getCurrentGameState(userId?: string): Promise<GameStateData | null> {
    if (!this.currentGame) {
      return null;
    }

    const bets = await CrashBet.findAll({
      where: {
        gameId: this.currentGame.id,
      },
    });

    const activeBets: ActiveBet[] = bets.map((bet) => ({
      userId: bet.userId,
      amount: parseFloat(String(bet.betAmount)),
      currency: bet.currency,
      status: bet.status as 'pending' | 'playing' | 'cashed_out',
      cashOutAt: bet.cashOutAt ? parseFloat(String(bet.cashOutAt)) : undefined,
    }));

    let currentMultiplier: number | undefined;
    let timeElapsed: number | undefined;
    let bettingTimeLeft: number | undefined;

    if (this.currentGame.status === 'running') {
      timeElapsed = Date.now() - this.gameStartTime;
      currentMultiplier = calculateMultiplier(timeElapsed);
    } else if (this.currentGame.status === 'betting') {
      const bettingStartTime = new Date(this.currentGame.createdAt).getTime();
      const bettingEndTime = bettingStartTime + this.config.bettingDuration * 1000;
      bettingTimeLeft = Math.max(0, bettingEndTime - Date.now());
    }

    // Find user's bet if userId is provided
    let userBet: { betId: string; amount: number; currency: string } | undefined;
    if (userId) {
      const bet = bets.find((b) => b.userId === userId && (b.status === 'pending' || b.status === 'playing'));
      if (bet) {
        userBet = {
          betId: bet.id,
          amount: parseFloat(String(bet.betAmount)),
          currency: bet.currency,
        };
      }
    }

    return {
      gameId: this.currentGame.id,
      gameNumber: this.currentGame.gameNumber,
      status: this.currentGame.status as 'betting' | 'running' | 'crashed',
      crashPoint:
        this.currentGame.status === 'crashed'
          ? parseFloat(String(this.currentGame.crashPoint))
          : undefined,
      serverSeedHash: this.currentGame.serverSeedHash,
      currentMultiplier,
      timeElapsed,
      bettingTimeLeft,
      activeBets,
      userBet,
    };
  }

  
  public async getGameHistory(limit = 10): Promise<GameHistoryItem[]> {
    const games = await CrashGame.findAll({
      where: {
        status: 'crashed',
      },
      order: [['gameNumber', 'DESC']],
      limit,
    });

    return games
      .filter((game) => game.crashedAt !== null)
      .map((game) => ({
        gameNumber: game.gameNumber,
        crashPoint: parseFloat(String(game.crashPoint)),
        serverSeedHash: game.serverSeedHash,
        crashedAt: game.crashedAt as Date,
      }));
  }

  
  private checkRateLimit(userId: string, action: 'bet' | 'cashout'): boolean {
    const now = Date.now();
    const windowMs = 60000; 
    const maxAttempts = action === 'bet' ? 10 : 20; 

    const attemptsMap = action === 'bet' ? this.betAttempts : this.cashOutAttempts;
    const attempts = attemptsMap.get(userId) || [];

    
    const recentAttempts = attempts.filter((timestamp) => now - timestamp < windowMs);

    if (recentAttempts.length >= maxAttempts) {
      return false;
    }

    
    recentAttempts.push(now);
    attemptsMap.set(userId, recentAttempts);

    return true;
  }

  
  public cleanupRateLimits(): void {
    const now = Date.now();
    const windowMs = 60000;

    for (const [userId, attempts] of this.betAttempts.entries()) {
      const recentAttempts = attempts.filter((timestamp) => now - timestamp < windowMs);
      if (recentAttempts.length === 0) {
        this.betAttempts.delete(userId);
      } else {
        this.betAttempts.set(userId, recentAttempts);
      }
    }

    for (const [userId, attempts] of this.cashOutAttempts.entries()) {
      const recentAttempts = attempts.filter((timestamp) => now - timestamp < windowMs);
      if (recentAttempts.length === 0) {
        this.cashOutAttempts.delete(userId);
      } else {
        this.cashOutAttempts.set(userId, recentAttempts);
      }
    }
  }
}
