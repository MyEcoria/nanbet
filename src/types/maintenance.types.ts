export interface MaintenanceAttributes {
  id: string;
  isActive: boolean;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  estimatedDuration: number | null; // minutes
  message: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MaintenanceCreationAttributes {
  id?: string;
  isActive: boolean;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
  estimatedDuration?: number | null;
  message?: string | null;
}

export interface MaintenanceStatus {
  isActive: boolean;
  isScheduled: boolean;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  estimatedDuration: number | null;
  message: string | null;
}

export interface ActivateMaintenanceRequest {
  estimatedDuration?: number; // minutes
  message?: string;
}

export interface ScheduleMaintenanceRequest {
  scheduledStart: string; // ISO date string
  estimatedDuration: number; // minutes
  message?: string;
}
