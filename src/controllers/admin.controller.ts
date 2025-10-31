import type { Request, Response } from 'express';
import { Withdrawal } from '../models/Withdrawal.model';
import { maintenanceService } from '../services/maintenance.service';
import * as sseService from '../services/sse.service';
import type {
  ActivateMaintenanceRequest,
  MaintenanceStatus,
  ScheduleMaintenanceRequest,
} from '../types/maintenance.types';
import { logger } from '../utils/logger';

export async function getMaintenanceStatus(_req: Request, res: Response): Promise<void> {
  try {
    const status = await maintenanceService.getStatus();

    res.json({
      success: true,
      maintenance: status,
    });
  } catch (error) {
    logger.error('[AdminController] Error getting maintenance status', { error });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Error getting maintenance status',
    });
  }
}

export async function activateMaintenance(req: Request, res: Response): Promise<void> {
  try {
    const { estimatedDuration, message } = req.body as ActivateMaintenanceRequest;

    const status = await maintenanceService.activateMaintenance(estimatedDuration, message);

    // Broadcast maintenance status to all connected clients via SSE
    broadcastMaintenanceStatus(status);

    res.json({
      success: true,
      message: 'Maintenance mode activated',
      maintenance: status,
    });

    logger.info('[AdminController] Maintenance activated', {
      estimatedDuration,
      ip: req.ip,
    });
  } catch (error) {
    logger.error('[AdminController] Error activating maintenance', { error });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Error activating maintenance',
    });
  }
}

export async function deactivateMaintenance(req: Request, res: Response): Promise<void> {
  try {
    const status = await maintenanceService.deactivateMaintenance();

    // Broadcast maintenance status to all connected clients via SSE
    broadcastMaintenanceStatus(status);

    res.json({
      success: true,
      message: 'Maintenance mode deactivated',
      maintenance: status,
    });

    logger.info('[AdminController] Maintenance deactivated', {
      ip: req.ip,
    });
  } catch (error) {
    logger.error('[AdminController] Error deactivating maintenance', { error });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Error deactivating maintenance',
    });
  }
}

export async function scheduleMaintenance(req: Request, res: Response): Promise<void> {
  try {
    const { scheduledStart, estimatedDuration, message } = req.body as ScheduleMaintenanceRequest;

    if (!scheduledStart || !estimatedDuration) {
      res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST',
        message: 'scheduledStart and estimatedDuration are required',
      });
      return;
    }

    const startDate = new Date(scheduledStart);

    if (Number.isNaN(startDate.getTime())) {
      res.status(400).json({
        success: false,
        error: 'INVALID_DATE',
        message: 'Invalid scheduledStart date format',
      });
      return;
    }

    if (startDate <= new Date()) {
      res.status(400).json({
        success: false,
        error: 'INVALID_DATE',
        message: 'scheduledStart must be in the future',
      });
      return;
    }

    if (estimatedDuration <= 0) {
      res.status(400).json({
        success: false,
        error: 'INVALID_DURATION',
        message: 'estimatedDuration must be positive',
      });
      return;
    }

    const status = await maintenanceService.scheduleMaintenance(
      startDate,
      estimatedDuration,
      message
    );

    // Broadcast maintenance status to all connected clients via SSE
    broadcastMaintenanceStatus(status);

    res.json({
      success: true,
      message: 'Maintenance scheduled successfully',
      maintenance: status,
    });

    logger.info('[AdminController] Maintenance scheduled', {
      scheduledStart: startDate,
      estimatedDuration,
      ip: req.ip,
    });
  } catch (error) {
    logger.error('[AdminController] Error scheduling maintenance', { error });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Error scheduling maintenance',
    });
  }
}

export async function cancelScheduledMaintenance(req: Request, res: Response): Promise<void> {
  try {
    const status = await maintenanceService.cancelScheduledMaintenance();

    // Broadcast maintenance status to all connected clients via SSE
    broadcastMaintenanceStatus(status);

    res.json({
      success: true,
      message: 'Scheduled maintenance cancelled',
      maintenance: status,
    });

    logger.info('[AdminController] Scheduled maintenance cancelled', {
      ip: req.ip,
    });
  } catch (error) {
    logger.error('[AdminController] Error cancelling scheduled maintenance', { error });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Error cancelling scheduled maintenance',
    });
  }
}

function broadcastMaintenanceStatus(status: MaintenanceStatus): void {
  sseService.broadcastToAll('maintenance:update', {
    maintenance: status,
    timestamp: new Date().toISOString(),
  });
  logger.info('[AdminController] Broadcasted maintenance status update');
}

export async function getFailedWithdrawals(req: Request, res: Response): Promise<void> {
  try {
    const { limit = 100, offset = 0 } = req.query;

    const { count, rows: withdrawals } = await Withdrawal.findAndCountAll({
      where: {
        status: 'failed',
      },
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset: Number(offset),
    });

    res.json({
      success: true,
      data: {
        withdrawals,
        total: count,
        limit: Number(limit),
        offset: Number(offset),
      },
    });

    logger.info('[AdminController] Retrieved failed withdrawals', {
      count,
      ip: req.ip,
    });
  } catch (error) {
    logger.error('[AdminController] Error getting failed withdrawals', { error });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Error getting failed withdrawals',
    });
  }
}
