import { Op } from 'sequelize';
import { Maintenance } from '../config/database';
import type { MaintenanceStatus } from '../types/maintenance.types';
import { logger } from '../utils/logger';
import type { CrashGameService } from './crash.service';

class MaintenanceService {
  private currentStatus: MaintenanceStatus | null = null;
  private crashService: CrashGameService | null = null;

  async initialize(crashService?: CrashGameService): Promise<void> {
    if (crashService) {
      this.crashService = crashService;
    }
    await this.loadCurrentStatus();
    logger.info('[MaintenanceService] Initialized');
  }

  setCrashService(crashService: CrashGameService): void {
    this.crashService = crashService;
  }

  private async loadCurrentStatus(): Promise<void> {
    try {
      const maintenance = await Maintenance.findOne({
        order: [['createdAt', 'DESC']],
      });

      if (maintenance) {
        this.currentStatus = this.buildStatus(maintenance);
      } else {
        // Create default maintenance record
        const defaultMaintenance = await Maintenance.create({
          isActive: false,
          scheduledStart: null,
          scheduledEnd: null,
          estimatedDuration: null,
          message: null,
        });
        this.currentStatus = this.buildStatus(defaultMaintenance);
      }
    } catch (error) {
      logger.error('[MaintenanceService] Error loading status', { error });
      this.currentStatus = {
        isActive: false,
        isScheduled: false,
        scheduledStart: null,
        scheduledEnd: null,
        estimatedDuration: null,
        message: null,
      };
    }
  }

  private buildStatus(maintenance: Maintenance): MaintenanceStatus {
    const now = new Date();
    const isScheduled =
      maintenance.scheduledStart !== null &&
      new Date(maintenance.scheduledStart) > now;

    return {
      isActive: maintenance.isActive,
      isScheduled,
      scheduledStart: maintenance.scheduledStart,
      scheduledEnd: maintenance.scheduledEnd,
      estimatedDuration: maintenance.estimatedDuration,
      message: maintenance.message,
    };
  }

  async getStatus(): Promise<MaintenanceStatus> {
    if (!this.currentStatus) {
      await this.loadCurrentStatus();
    }
    return this.currentStatus!;
  }

  async isMaintenanceActive(): Promise<boolean> {
    const status = await this.getStatus();
    return status.isActive;
  }

  async activateMaintenance(estimatedDuration?: number, message?: string): Promise<MaintenanceStatus> {
    try {
      const now = new Date();
      const scheduledEnd = estimatedDuration
        ? new Date(now.getTime() + estimatedDuration * 60000)
        : null;

      // Notify crash service to prepare for maintenance
      if (this.crashService) {
        this.crashService.prepareForMaintenance();
        logger.info('[MaintenanceService] Crash service notified of maintenance');
      }

      const maintenance = await Maintenance.create({
        isActive: true,
        scheduledStart: now,
        scheduledEnd,
        estimatedDuration,
        message: message || 'Casino is currently under maintenance. Please try again later.',
      });

      this.currentStatus = this.buildStatus(maintenance);

      logger.info('[MaintenanceService] Maintenance activated', {
        estimatedDuration,
        scheduledEnd,
      });

      return this.currentStatus;
    } catch (error) {
      logger.error('[MaintenanceService] Error activating maintenance', { error });
      throw error;
    }
  }

  async scheduleMaintenance(
    scheduledStart: Date,
    estimatedDuration: number,
    message?: string
  ): Promise<MaintenanceStatus> {
    try {
      const scheduledEnd = new Date(scheduledStart.getTime() + estimatedDuration * 60000);

      const maintenance = await Maintenance.create({
        isActive: false,
        scheduledStart,
        scheduledEnd,
        estimatedDuration,
        message: message ||
          `Scheduled maintenance on ${scheduledStart.toLocaleString('en-US')} for an estimated duration of ${estimatedDuration} minutes.`,
      });

      this.currentStatus = this.buildStatus(maintenance);

      logger.info('[MaintenanceService] Maintenance scheduled', {
        scheduledStart,
        scheduledEnd,
        estimatedDuration,
      });

      return this.currentStatus;
    } catch (error) {
      logger.error('[MaintenanceService] Error scheduling maintenance', { error });
      throw error;
    }
  }

  async deactivateMaintenance(): Promise<MaintenanceStatus> {
    try {
      // Resume crash service operations
      if (this.crashService) {
        this.crashService.resumeAfterMaintenance();
        logger.info('[MaintenanceService] Crash service resumed after maintenance');
      }

      const maintenance = await Maintenance.create({
        isActive: false,
        scheduledStart: null,
        scheduledEnd: null,
        estimatedDuration: null,
        message: null,
      });

      this.currentStatus = this.buildStatus(maintenance);

      logger.info('[MaintenanceService] Maintenance deactivated');

      return this.currentStatus;
    } catch (error) {
      logger.error('[MaintenanceService] Error deactivating maintenance', { error });
      throw error;
    }
  }

  async cancelScheduledMaintenance(): Promise<MaintenanceStatus> {
    return this.deactivateMaintenance();
  }

  async checkAndActivateScheduledMaintenance(): Promise<boolean> {
    try {
      const status = await this.getStatus();

      if (status.isScheduled && status.scheduledStart) {
        const now = new Date();
        const scheduledStart = new Date(status.scheduledStart);

        if (now >= scheduledStart && !status.isActive) {
          await this.activateMaintenance(
            status.estimatedDuration || undefined,
            status.message || undefined
          );
          logger.info('[MaintenanceService] Scheduled maintenance activated automatically');
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('[MaintenanceService] Error checking scheduled maintenance', { error });
      return false;
    }
  }
}

export const maintenanceService = new MaintenanceService();
