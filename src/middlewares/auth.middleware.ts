import type { NextFunction, Request, Response } from 'express';
import { LoginHistory, User } from '../config/database';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: User;
  session?: LoginHistory;
}

export async function verifyToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'No authentication token provided',
      });
      return;
    }

    const session = await LoginHistory.findOne({
      where: {
        authToken: token,
        isAuthenticated: true,
      },
      include: [
        {
          model: User,
          as: 'user',
        },
      ],
    });

    if (!session) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
      return;
    }

    if (new Date() > session.expiresAt) {
      res.status(401).json({
        success: false,
        message: 'Session expired',
      });
      return;
    }

    if (!session.userId) {
      res.status(401).json({
        success: false,
        message: 'Invalid session',
      });
      return;
    }

    const user = await User.findByPk(session.userId);

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    req.user = user;
    req.session = session;

    next();
  } catch (error) {
    logger.error('Auth middleware error', { error });
    res.status(500).json({
      success: false,
      message: 'Authentication error',
    });
  }
}
