import { Router } from 'express';
import {
  createWithdrawal,
  getWithdrawal,
  getWithdrawals,
} from '../controllers/withdrawal.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { checkMaintenance } from '../middlewares/maintenance.middleware';

const router = Router();

router.use(verifyToken);

// Apply maintenance check only to create withdrawal
router.post('/', checkMaintenance, createWithdrawal);

// Allow viewing withdrawals even during maintenance
router.get('/', getWithdrawals);
router.get('/:id', getWithdrawal);

export default router;
