import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware';
import { withdrawalService } from '../services/withdrawal.service';
import { logger } from '../utils/logger';

export async function createWithdrawal(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
      return;
    }

    const { currency, amount, destinationAddress } = req.body;

    if (!currency || !amount || !destinationAddress) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: currency, amount, destinationAddress',
      });
      return;
    }

    const result = await withdrawalService.createWithdrawal({
      userId: req.user.id,
      currency,
      amount: parseFloat(amount),
      destinationAddress,
    });

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        withdrawal: {
          id: result.withdrawal?.id,
          currency: result.withdrawal?.currency,
          amount: result.withdrawal?.amount,
          destinationAddress: result.withdrawal?.destinationAddress,
          status: result.withdrawal?.status,
          createdAt: result.withdrawal?.createdAt,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error('Error in createWithdrawal controller', { error });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
}

export async function getWithdrawals(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const withdrawals = await withdrawalService.getUserWithdrawals(req.user.id, limit);

    res.json({
      success: true,
      withdrawals: withdrawals.map((w) => ({
        id: w.id,
        currency: w.currency,
        amount: w.amount,
        destinationAddress: w.destinationAddress,
        status: w.status,
        transactionHash: w.transactionHash,
        failureReason: w.failureReason,
        createdAt: w.createdAt,
        processedAt: w.processedAt,
      })),
    });
  } catch (error) {
    logger.error('Error in getWithdrawals controller', { error });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
}

export async function getWithdrawal(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
      return;
    }

    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'Missing withdrawal ID',
      });
      return;
    }

    const withdrawal = await withdrawalService.getWithdrawalById(id, req.user.id);

    if (!withdrawal) {
      res.status(404).json({
        success: false,
        message: 'Withdrawal not found',
      });
      return;
    }

    res.json({
      success: true,
      withdrawal: {
        id: withdrawal.id,
        currency: withdrawal.currency,
        amount: withdrawal.amount,
        destinationAddress: withdrawal.destinationAddress,
        status: withdrawal.status,
        transactionHash: withdrawal.transactionHash,
        failureReason: withdrawal.failureReason,
        createdAt: withdrawal.createdAt,
        processedAt: withdrawal.processedAt,
      },
    });
  } catch (error) {
    logger.error('Error in getWithdrawal controller', { error });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
}
