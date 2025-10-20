import { Router } from 'express';
import { callback, events, getMe, initiate } from '../controllers/user.controller';
import { verifyToken } from '../middlewares/auth.middleware';

const router = Router();

/**
 * POST /user/initiate
 * Initiate authentication session and get session ID + message to sign
 */
router.post('/initiate', initiate);

/**
 * GET /user/events/:sessionId
 * Server-Sent Events endpoint for real-time authentication updates
 */
router.get('/events/:sessionId', events);

/**
 * POST /user/callback
 * Process signed authentication callback from wallet
 */
router.post('/callback', callback);

/**
 * GET /user/me
 * Get authenticated user information (requires token)
 */
router.get('/me', verifyToken, getMe);

export default router;
