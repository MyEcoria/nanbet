import { DataTypes, Model, type Sequelize } from 'sequelize';
import type { MaintenanceAttributes, MaintenanceCreationAttributes } from '../types/maintenance.types';

export class Maintenance extends Model<MaintenanceAttributes, MaintenanceCreationAttributes> {
  declare id: string;
  declare isActive: boolean;
  declare scheduledStart: Date | null;
  declare scheduledEnd: Date | null;
  declare estimatedDuration: number | null;
  declare message: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export const initMaintenanceModel = (sequelize: Sequelize): typeof Maintenance => {
  Maintenance.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Indicates if maintenance is currently active',
      },
      scheduledStart: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Scheduled maintenance start time',
      },
      scheduledEnd: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Scheduled maintenance end time',
      },
      estimatedDuration: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Estimated duration in minutes',
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Custom message to display during maintenance',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'maintenance',
      timestamps: true,
    }
  );

  return Maintenance;
};
