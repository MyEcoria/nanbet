import { Router } from 'express';
import {
  createWithdrawal,
  getWithdrawal,
  getWithdrawals,
} from '../controllers/withdrawal.controller';
import { verifyToken } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);
router.post('/', createWithdrawal);
router.get('/', getWithdrawals);
router.get('/:id', getWithdrawal);

export default router;
