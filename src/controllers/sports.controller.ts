import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware';
import { SportsBet } from '../models/SportsBet.model';
import { sportsService } from '../services/sports.service';
import { logger } from '../utils/logger';

export async function getMatches(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const matches = await sportsService.listMatches();
    res.json({ success: true, matches });
  } catch (error) {
    logger.error('Error getting sports matches', { error });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

export async function getMyBets(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const bets = await SportsBet.findAll({
      where: { userId: req.user.id },
      order: [['placedAt', 'DESC']],
      limit: 50,
      include: [{ association: 'match' }],
    });

    res.json({ success: true, bets });
  } catch (error) {
    logger.error('Error getting sports bets', { error });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
