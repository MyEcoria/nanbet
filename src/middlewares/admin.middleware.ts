import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

export function verifyAdminKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const adminKey = req.headers['x-admin-key'] as string;

    if (!adminKey) {
      res.status(401).json({
        success: false,
        error: 'MISSING_ADMIN_KEY',
        message: 'Admin key is required',
      });
      return;
    }

    const expectedKey = process.env.ADMIN_KEY;

    if (!expectedKey) {
      logger.error('[AdminMiddleware] ADMIN_KEY not configured in environment');
      res.status(500).json({
        success: false,
        error: 'SERVER_MISCONFIGURED',
        message: 'Admin key not configured',
      });
      return;
    }

    if (adminKey !== expectedKey) {
      logger.warn('[AdminMiddleware] Invalid admin key attempt', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(403).json({
        success: false,
        error: 'INVALID_ADMIN_KEY',
        message: 'Invalid admin key',
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('[AdminMiddleware] Error verifying admin key', { error });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Error verifying admin key',
    });
  }
}
