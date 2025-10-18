import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { SSEService } from '../services/sse.service';
import { CallbackRequest } from '../types/auth.types';
import { AuthRequest } from '../middlewares/auth.middleware';

export class UserController {
  /**
   * POST /user/initiate
   * Initiate authentication session
   */
  static async initiate(req: Request, res: Response): Promise<void> {
    try {
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const session = await AuthService.initiateSession(ipAddress);

      res.json({
        success: true,
        sessionId: session.sessionId,
        message: session.message,
        expiresAt: session.expiresAt,
        expiresIn: session.expiresIn,
        callbackUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/user/callback`
      });
    } catch (error) {
      console.error('Error initiating session:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initiate session'
      });
    }
  }

  /**
   * GET /user/events/:sessionId
   * SSE endpoint for real-time authentication updates
   */
  static async events(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      // Validate session exists
      const validation = await AuthService.validateSession(sessionId);
      if (!validation.valid) {
        res.status(404).json({
          success: false,
          message: validation.message
        });
        return;
      }

      // Add SSE client
      SSEService.addClient(sessionId, res);
    } catch (error) {
      console.error('Error establishing SSE connection:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to establish SSE connection'
      });
    }
  }

  /**
   * POST /user/callback
   * Process signed authentication callback
   */
  static async callback(req: Request, res: Response): Promise<void> {
    try {
      const data: CallbackRequest = req.body;

      // Validate request body
      if (!data.message || !data.signature || !data.account || !data.signatureType) {
        res.status(400).json({
          success: false,
          message: 'Invalid request body'
        });
        return;
      }

      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const result = await AuthService.processCallback(data, ipAddress);

      if (result.success) {
        res.json({
          success: true,
          userId: result.userId,
          sessionId: result.sessionId,
          message: result.message
        });
      } else {
        res.status(401).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error('Error processing callback:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * GET /user/me
   * Get authenticated user information
   * Requires authentication token in cookie or Authorization header
   */
  static async getMe(req: AuthRequest, res: Response): Promise<void> {
    try {
      // User is already attached by auth middleware
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Not authenticated'
        });
        return;
      }

      res.json({
        success: true,
        user: {
          id: req.user.id,
          address: req.user.address,
          createdAt: req.user.createdAt
        }
      });
    } catch (error) {
      console.error('Error getting user info:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
