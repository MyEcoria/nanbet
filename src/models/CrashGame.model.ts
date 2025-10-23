import { DataTypes, Model, type Sequelize } from 'sequelize';
import type { CrashGameAttributes, CrashGameCreationAttributes } from '../types/models.types';

export class CrashGame extends Model<CrashGameAttributes, CrashGameCreationAttributes> {
  declare id: string;
  declare gameNumber: number;
  declare serverSeed: string;
  declare serverSeedHash: string;
  declare crashPoint: number;
  declare startedAt: Date;
  declare crashedAt: Date | null;
  declare status: 'pending' | 'betting' | 'running' | 'crashed';
  declare createdAt: Date;
}

export const initCrashGameModel = (sequelize: Sequelize): typeof CrashGame => {
  CrashGame.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      gameNumber: {
        type: DataTypes.INTEGER,
        allowNull: true,
        unique: true,
      },
      serverSeed: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      serverSeedHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      crashPoint: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      startedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      crashedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('pending', 'betting', 'running', 'crashed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'crash_games',
      timestamps: false,
      indexes: [
        {
          fields: ['gameNumber'],
          unique: true,
        },
        {
          fields: ['status'],
        },
      ],
    }
  );

  return CrashGame;
};
