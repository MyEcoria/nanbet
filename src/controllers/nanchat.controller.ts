import type { Response } from 'express';
import { User, LoginHistory } from '../config/database';
import type { AuthRequest } from '../middlewares/auth.middleware';
import { addMemberToGroup, computeWheelResult, creditWheelPrize } from '../services/nanchat.service';
import { logger } from '../utils/logger';

/**
 * POST /user/spin-wheel
 *
 * If the authenticated user is not yet in the NanChat group:
 *  1. Checks if the client IP has already spun the wheel 5 or more times.
 *  2. Adds them to the NanChat group.
 *  3. Computes a deterministic wheel prize based on account age, bet volume, and luck.
 *  4. Credits the prize to their balance.
 *  5. Marks the user as a NanChat group member and records the spin date.
 *
 * Returns an error if the user has already spun.
 */
export async function spinWheel(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    // Already in group / already spun
    if (user.nanchatGroupMember) {
      res.status(400).json({
        success: false,
        message: 'You have already joined the NanChat group and spun the wheel.',
      });
      return;
    }

    // IP Check: Limit to 5 spins per IP
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    if (ipAddress !== 'unknown') {
      const spunCount = await User.count({
        distinct: true,
        col: 'id',
        where: {
          nanchatGroupMember: true,
        },
        include: [
          {
            model: LoginHistory,
            as: 'loginHistory',
            where: {
              ipAddress,
            },
            required: true,
          },
        ],
      });

      if (spunCount >= 5) {
        res.status(400).json({
          success: false,
          message: 'Limit of 5 wheel spins per IP address has been reached.',
        });
        return;
      }
    }

    // 1. Add to NanChat group
    try {
      await addMemberToGroup(user.address);
    } catch (nanchatError) {
      logger.error('Failed to add user to NanChat group', {
        userId: user.id,
        error: nanchatError instanceof Error ? nanchatError.message : String(nanchatError),
      });
      // Still continue with the wheel — don't block the user if NanChat API is unreachable
    }

    // 2. Compute wheel result
    const prize = await computeWheelResult(user);

    // 3. Credit prize
    await creditWheelPrize(user, prize);

    // 4. Mark as member + record spin time
    await user.update({
      nanchatGroupMember: true,
      wheelSpunAt: new Date(),
    });

    res.json({
      success: true,
      prize: {
        currency: prize.currency,
        amount: prize.amount,
      },
      message:
        prize.currency === 'NONE'
          ? 'You joined the group but the wheel landed on nothing this time. Good luck next time!'
          : `Congratulations! You won ${prize.amount} ${prize.currency}!`,
    });
  } catch (error) {
    logger.error('Error in spinWheel controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
