import { Router } from 'express';
import {
  callback,
  events,
  getMaintenanceStatus,
  getMe,
  initiate,
} from '../controllers/user.controller';
import { spinWheel } from '../controllers/nanchat.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { verifyTurnstile } from '../middlewares/turnstile.middleware';

const router = Router();

router.post('/initiate', initiate);
router.get('/events/:sessionId', events);
router.post('/callback', callback);
router.get('/me', verifyToken, getMe);
router.get('/maintenance', getMaintenanceStatus);
router.post('/spin-wheel', verifyToken, verifyTurnstile, spinWheel);

export default router;
