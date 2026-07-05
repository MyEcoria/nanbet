import { Router } from 'express';
import { getMatches, getMyBets } from '../controllers/sports.controller';
import { verifyToken } from '../middlewares/auth.middleware';

const router = Router();

router.get('/matches', getMatches);
router.get('/bets', verifyToken, getMyBets);

export default router;
