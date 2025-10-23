import { Router } from 'express';
import { callback, events, getMe, initiate } from '../controllers/user.controller';
import { verifyToken } from '../middlewares/auth.middleware';

const router = Router();


router.post('/initiate', initiate);


router.get('/events/:sessionId', events);


router.post('/callback', callback);


router.get('/me', verifyToken, getMe);

export default router;
