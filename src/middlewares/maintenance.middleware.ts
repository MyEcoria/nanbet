import type { NextFunction, Request, Response } from 'express';
import { maintenanceService } from '../services/maintenance.service';
import { logger } from '../utils/logger';

export async function checkMaintenance(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const isActive = await maintenanceService.isMaintenanceActive();

    if (isActive) {
      const status = await maintenanceService.getStatus();

      res.status(503).json({
        success: false,
        error: 'MAINTENANCE_MODE',
        message: status.message || 'Casino is currently under maintenance.',
        maintenance: {
          isActive: true,
          estimatedEnd: status.scheduledEnd,
          estimatedDuration: status.estimatedDuration,
        },
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('[MaintenanceMiddleware] Error checking maintenance', { error });
    next();
  }
}
