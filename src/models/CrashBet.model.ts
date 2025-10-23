import { DataTypes, Model, type Sequelize } from 'sequelize';
import type { CrashBetAttributes, CrashBetCreationAttributes } from '../types/models.types';

export class CrashBet extends Model<CrashBetAttributes, CrashBetCreationAttributes> {
  declare id: string;
  declare userId: string;
  declare gameId: string;
  declare currency: string;
  declare betAmount: number;
  declare cashOutAt: number | null;
  declare profit: number;
  declare status: 'pending' | 'playing' | 'cashed_out' | 'lost';
  declare createdAt: Date;
  declare cashOutTime: Date | null;
}

export const initCrashBetModel = (sequelize: Sequelize): typeof CrashBet => {
  CrashBet.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      gameId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'crash_games',
          key: 'id',
        },
      },
      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },
      betAmount: {
        type: DataTypes.DECIMAL(30, 10),
        allowNull: false,
      },
      cashOutAt: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      profit: {
        type: DataTypes.DECIMAL(30, 10),
        allowNull: false,
        defaultValue: 0,
      },
      status: {
        type: DataTypes.ENUM('pending', 'playing', 'cashed_out', 'lost'),
        allowNull: false,
        defaultValue: 'pending',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      cashOutTime: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'crash_bets',
      timestamps: false,
      indexes: [
        {
          fields: ['userId'],
        },
        {
          fields: ['gameId'],
        },
        {
          fields: ['status'],
        },
        {
          fields: ['gameId', 'userId'],
          unique: true,
        },
      ],
    }
  );

  return CrashBet;
};
