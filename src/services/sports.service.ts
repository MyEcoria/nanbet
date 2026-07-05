import type { Server as SocketIOServer } from 'socket.io';
import { sequelize } from '../config/database';
import wallets from '../config/wallets';
import { SportsBet } from '../models/SportsBet.model';
import { SportsMatch } from '../models/SportsMatch.model';
import { User } from '../models/User.model';
import type { SportsMatchSummary, SportsOutcome } from '../types/sports.types';
import { logger } from '../utils/logger';

const MIN_BETTABLE_ODDS = 1.1;

class SportsService {
  private io: SocketIOServer | null = null;
  private betAttempts: Map<string, number[]> = new Map();

  public setIO(io: SocketIOServer): void {
    this.io = io;
  }

  public async listMatches(): Promise<SportsMatchSummary[]> {
    const matches = await SportsMatch.findAll({
      where: {},
      order: [['startTime', 'ASC']],
    });

    return matches.map((match) => ({
      id: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeFlag: match.homeFlag,
      awayFlag: match.awayFlag,
      startTime: match.startTime.toISOString(),
      status: match.status,
      homeOdds: parseFloat(String(match.homeOdds)),
      drawOdds: parseFloat(String(match.drawOdds)),
      awayOdds: parseFloat(String(match.awayOdds)),
      winningOutcome: match.winningOutcome,
    }));
  }

  public async placeBet(
    userId: string,
    matchId: string,
    outcome: SportsOutcome,
    amount: number,
    currency: string
  ): Promise<{
    success: boolean;
    betId?: string;
    odds?: number;
    potentialPayout?: number;
    error?: string;
    code?: string;
  }> {
    if (!this.checkRateLimit(userId)) {
      return { success: false, error: 'Too many bet attempts. Please wait.', code: 'RATE_LIMIT' };
    }

    const wallet = wallets[currency as keyof typeof wallets];
    if (!wallet) {
      return { success: false, error: 'Invalid currency', code: 'INVALID_CURRENCY' };
    }

    if (amount > wallet.maxBet) {
      return { success: false, error: `Maximum bet is ${wallet.maxBet}`, code: 'BET_TOO_HIGH' };
    }

    try {
      const result = await sequelize.transaction(async (t) => {
        const match = await SportsMatch.findByPk(matchId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!match) {
          throw new Error('MATCH_NOT_FOUND');
        }

        if (match.status !== 'scheduled' && match.status !== 'live') {
          throw new Error('BETTING_CLOSED');
        }

        const existingBet = await SportsBet.findOne({
          where: { userId, matchId },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (existingBet) {
          throw new Error('BET_ALREADY_PLACED');
        }

        const odds = parseFloat(
          String(
            outcome === 'home'
              ? match.homeOdds
              : outcome === 'draw'
                ? match.drawOdds
                : match.awayOdds
          )
        );

        if (odds < MIN_BETTABLE_ODDS) {
          throw new Error('ODDS_TOO_LOW');
        }

        const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!user) {
          throw new Error('USER_NOT_FOUND');
        }

        const balanceField = `balance${currency}` as keyof User;
        const currentBalance = parseFloat(String(user[balanceField] ?? 0));

        if (currentBalance < amount) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        const potentialPayout = Math.round(amount * odds * 1e10) / 1e10;

        await user.update({ [balanceField]: currentBalance - amount }, { transaction: t });

        const bet = await SportsBet.create(
          { userId, matchId, outcome, currency, amount, odds, potentialPayout },
          { transaction: t }
        );

        return { bet, user };
      });

      logger.info('[Sports] Bet placed', {
        userId,
        matchId,
        outcome,
        amount,
        currency,
        betId: result.bet.id,
      });

      this.io?.to(`user:${userId}`).emit('balance:update', {
        balanceXNO: parseFloat(String(result.user.balanceXNO)),
        balanceBAN: parseFloat(String(result.user.balanceBAN)),
        balanceXRO: parseFloat(String(result.user.balanceXRO)),
        balanceANA: parseFloat(String(result.user.balanceANA)),
        balanceXDG: parseFloat(String(result.user.balanceXDG)),
        balanceNANUSD: parseFloat(String(result.user.balanceNANUSD)),
      });

      return {
        success: true,
        betId: result.bet.id,
        odds: result.bet.odds,
        potentialPayout: result.bet.potentialPayout,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[Sports] Error placing bet', { error, userId, matchId, outcome, amount });

      const knownErrors: Record<string, { error: string; code: string }> = {
        MATCH_NOT_FOUND: { error: 'Match not found', code: 'MATCH_NOT_FOUND' },
        BETTING_CLOSED: { error: 'Betting is closed for this match', code: 'BETTING_CLOSED' },
        BET_ALREADY_PLACED: {
          error: 'You already have a bet on this match',
          code: 'BET_ALREADY_PLACED',
        },
        USER_NOT_FOUND: { error: 'User not found', code: 'USER_NOT_FOUND' },
        INSUFFICIENT_BALANCE: { error: 'Insufficient balance', code: 'INSUFFICIENT_BALANCE' },
        ODDS_TOO_LOW: {
          error: `Odds too low to bet (minimum ${MIN_BETTABLE_ODDS.toFixed(2)})`,
          code: 'ODDS_TOO_LOW',
        },
      };

      const known = knownErrors[errorMessage];
      if (known) {
        return { success: false, ...known };
      }

      return { success: false, error: 'Failed to place bet', code: 'INTERNAL_ERROR' };
    }
  }

  public async settleMatch(matchId: string, winningOutcome: SportsOutcome): Promise<void> {
    try {
      const settled = await sequelize.transaction(async (t) => {
        const bets = await SportsBet.findAll({
          where: { matchId, status: 'pending' },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        const results: { userId: string; bet: SportsBet; payout: number }[] = [];

        for (const bet of bets) {
          const user = await User.findByPk(bet.userId, { transaction: t, lock: t.LOCK.UPDATE });
          if (!user) continue;

          const won = bet.outcome === winningOutcome;
          const payout = won ? parseFloat(String(bet.potentialPayout)) : 0;

          if (won) {
            const balanceField = `balance${bet.currency}` as keyof User;
            const currentBalance = parseFloat(String(user[balanceField] ?? 0));
            await user.update({ [balanceField]: currentBalance + payout }, { transaction: t });
          }

          await bet.update(
            { status: won ? 'won' : 'lost', settledAt: new Date() },
            { transaction: t }
          );

          results.push({ userId: bet.userId, bet, payout });
        }

        return results;
      });

      for (const { userId, bet, payout } of settled) {
        const user = await User.findByPk(userId);
        if (user && this.io) {
          this.io.to(`user:${userId}`).emit('balance:update', {
            balanceXNO: parseFloat(String(user.balanceXNO)),
            balanceBAN: parseFloat(String(user.balanceBAN)),
            balanceXRO: parseFloat(String(user.balanceXRO)),
            balanceANA: parseFloat(String(user.balanceANA)),
            balanceXDG: parseFloat(String(user.balanceXDG)),
            balanceNANUSD: parseFloat(String(user.balanceNANUSD)),
          });

          this.io.to(`user:${userId}`).emit('sports:bet:settled', {
            betId: bet.id,
            matchId,
            outcome: bet.outcome,
            status: bet.status as 'won' | 'lost',
            amount: parseFloat(String(bet.amount)),
            currency: bet.currency,
            payout,
          });
        }
      }

      logger.info('[Sports] Match settled', {
        matchId,
        winningOutcome,
        betsSettled: settled.length,
      });
    } catch (error) {
      logger.error('[Sports] Error settling match', { error, matchId, winningOutcome });
    }
  }

  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const windowMs = 60000;
    const maxAttempts = 10;

    const attempts = this.betAttempts.get(userId) || [];
    const recentAttempts = attempts.filter((timestamp) => now - timestamp < windowMs);

    if (recentAttempts.length >= maxAttempts) {
      return false;
    }

    recentAttempts.push(now);
    this.betAttempts.set(userId, recentAttempts);
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
  }
}

export const sportsService = new SportsService();
