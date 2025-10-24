import type { Request, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware';
import { initiateSession, processCallback, validateSession } from '../services/auth.service';
import { addClient } from '../services/sse.service';
import type { CallbackRequest } from '../types/auth.types';
import { logger } from '../utils/logger';

export async function initiate(req: Request, res: Response): Promise<void> {
  try {
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const session = await initiateSession(ipAddress);

    res.json({
      success: true,
      sessionId: session.sessionId,
      message: session.message,
      expiresAt: session.expiresAt,
      expiresIn: session.expiresIn,
      callbackUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/user/callback`,
    });
  } catch (error) {
    logger.error('Error initiating session', { error });
    res.status(500).json({
      success: false,
      message: 'Failed to initiate session',
    });
  }
}

export async function events(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;

    const validation = await validateSession(sessionId);
    if (!validation.valid) {
      res.status(404).json({
        success: false,
        message: validation.message,
      });
      return;
    }

    addClient(sessionId, res);
  } catch (error) {
    logger.error('Error establishing SSE connection', { error });
    res.status(500).json({
      success: false,
      message: 'Failed to establish SSE connection',
    });
  }
}

export async function callback(req: Request, res: Response): Promise<void> {
  try {
    const data: CallbackRequest = req.body;
    console.log(data);

    if (!data.message || !data.signature || !data.account || !data.signatureType) {
      res.status(400).json({
        success: false,
        message: 'Invalid request body',
      });
      return;
    }

    const result = await processCallback(data);

    if (result.success) {
      res.json({
        success: true,
        userId: result.userId,
        sessionId: result.sessionId,
        message: result.message,
      });
    } else {
      res.status(401).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    logger.error('Error processing callback', { error });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
}

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
      return;
    }

    res.json({
      success: true,
      user: {
        id: req.user.id,
        address: req.user.address,
        depositAddress: req.user.depositAddress,
        balanceXNO: req.user.balanceXNO,
        balanceBAN: req.user.balanceBAN,
        balanceXRO: req.user.balanceXRO,
        balanceANA: req.user.balanceANA,
        balanceXDG: req.user.balanceXDG,
        balanceNANUSD: req.user.balanceNANUSD,
        createdAt: req.user.createdAt,
      },
    });
  } catch (error) {
    logger.error('Error getting user info', { error });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
}
