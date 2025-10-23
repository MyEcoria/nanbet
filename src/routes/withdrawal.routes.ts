import { Router } from 'express';
import {
  createWithdrawal,
  getWithdrawal,
  getWithdrawals,
} from '../controllers/withdrawal.controller';
import { verifyToken } from '../middlewares/auth.middleware';

const router = Router();

// All routes require authentication
router.use(verifyToken);

// Create a new withdrawal request
router.post('/', createWithdrawal);

// Get all withdrawals for the authenticated user
router.get('/', getWithdrawals);

// Get a specific withdrawal by ID
router.get('/:id', getWithdrawal);

export default router;
