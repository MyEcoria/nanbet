import { DataTypes, Model, type Sequelize } from 'sequelize';
import type { SportsMatchAttributes, SportsMatchCreationAttributes } from '../types/sports.types';

export class SportsMatch extends Model<SportsMatchAttributes, SportsMatchCreationAttributes> {
  declare id: string;
  declare polymarketEventId: string;
  declare slug: string;
  declare homeTeam: string;
  declare awayTeam: string;
  declare homeFlag: string;
  declare awayFlag: string;
  declare startTime: Date;
  declare status: 'scheduled' | 'live' | 'finished' | 'cancelled';
  declare homeTokenId: string;
  declare drawTokenId: string;
  declare awayTokenId: string;
  declare homeOdds: number;
  declare drawOdds: number;
  declare awayOdds: number;
  declare winningOutcome: 'home' | 'draw' | 'away' | null;
  declare resolvedAt: Date | null;
  declare lastSyncedAt: Date;
  declare createdAt: Date;
}

export const initSportsMatchModel = (sequelize: Sequelize): typeof SportsMatch => {
  SportsMatch.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      polymarketEventId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      slug: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      homeTeam: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      awayTeam: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      homeFlag: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      awayFlag: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      startTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('scheduled', 'live', 'finished', 'cancelled'),
        allowNull: false,
        defaultValue: 'scheduled',
      },
      homeTokenId: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      drawTokenId: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      awayTokenId: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      homeOdds: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 2,
      },
      drawOdds: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 3,
      },
      awayOdds: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 2,
      },
      winningOutcome: {
        type: DataTypes.ENUM('home', 'draw', 'away'),
        allowNull: true,
        defaultValue: null,
      },
      resolvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
      },
      lastSyncedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'sports_matches',
      timestamps: false,
      indexes: [
        {
          fields: ['polymarketEventId'],
          unique: true,
        },
        {
          fields: ['status'],
        },
        {
          fields: ['startTime'],
        },
      ],
    }
  );

  return SportsMatch;
};
