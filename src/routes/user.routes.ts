import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';

const router = Router();

/**
 * POST /user/initiate
 * Initiate authentication session and get session ID + message to sign
 */
router.post('/initiate', UserController.initiate);

/**
 * GET /user/events/:sessionId
 * Server-Sent Events endpoint for real-time authentication updates
 */
router.get('/events/:sessionId', UserController.events);

/**
 * POST /user/callback
 * Process signed authentication callback from wallet
 */
router.post('/callback', UserController.callback);

/**
 * GET /user/me
 * Get authenticated user information (requires token)
 */
router.get('/me', AuthMiddleware.verifyToken, UserController.getMe);

export default router;
