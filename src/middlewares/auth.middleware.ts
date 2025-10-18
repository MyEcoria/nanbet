import { Request, Response, NextFunction } from 'express';
import { LoginHistory, User } from '../config/database';

export interface AuthRequest extends Request {
  user?: User;
  session?: LoginHistory;
}

export class AuthMiddleware {
  /**
   * Verify authentication token from cookie or header
   */
  static async verifyToken(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Get token from cookie or Authorization header
      const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        res.status(401).json({
          success: false,
          message: 'No authentication token provided'
        });
        return;
      }

      // Find session with this token
      const session = await LoginHistory.findOne({
        where: {
          authToken: token,
          isAuthenticated: true
        },
        include: [{
          model: User,
          as: 'user'
        }]
      });

      if (!session) {
        res.status(401).json({
          success: false,
          message: 'Invalid or expired token'
        });
        return;
      }

      // Check if session expired
      if (new Date() > session.expiresAt) {
        res.status(401).json({
          success: false,
          message: 'Session expired'
        });
        return;
      }

      // Find user
      const user = await User.findByPk(session.userId!);

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'User not found'
        });
        return;
      }

      // Attach user and session to request
      req.user = user;
      req.session = session;

      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(500).json({
        success: false,
        message: 'Authentication error'
      });
    }
  }
}
