import { DataTypes, Model, type Sequelize } from 'sequelize';
import type { SportsBetAttributes, SportsBetCreationAttributes } from '../types/sports.types';

export class SportsBet extends Model<SportsBetAttributes, SportsBetCreationAttributes> {
  declare id: string;
  declare userId: string;
  declare matchId: string;
  declare outcome: 'home' | 'draw' | 'away';
  declare currency: string;
  declare amount: number;
  declare odds: number;
  declare potentialPayout: number;
  declare status: 'pending' | 'won' | 'lost' | 'void';
  declare placedAt: Date;
  declare settledAt: Date | null;
}

export const initSportsBetModel = (sequelize: Sequelize): typeof SportsBet => {
  SportsBet.init(
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
      matchId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'sports_matches',
          key: 'id',
        },
      },
      outcome: {
        type: DataTypes.ENUM('home', 'draw', 'away'),
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(30, 10),
        allowNull: false,
      },
      odds: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
      },
      potentialPayout: {
        type: DataTypes.DECIMAL(30, 10),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('pending', 'won', 'lost', 'void'),
        allowNull: false,
        defaultValue: 'pending',
      },
      placedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      settledAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
      },
    },
    {
      sequelize,
      tableName: 'sports_bets',
      timestamps: false,
      indexes: [{ fields: ['userId'] }, { fields: ['matchId'] }, { fields: ['status'] }],
    }
  );

  return SportsBet;
};
