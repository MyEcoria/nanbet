import { DataTypes, Model, type Sequelize } from 'sequelize';
import type { UserAttributes, UserCreationAttributes } from '../types/models.types';

export class User extends Model<UserAttributes, UserCreationAttributes> {
  declare id: string;
  declare address: string;
  declare depositAddress: string;
  declare balanceXNO: number;
  declare balanceBAN: number;
  declare balanceXRO: number;
  declare balanceANA: number;
  declare balanceXDG: number;
  declare balanceNANUSD: number;
  declare createdAt: Date;
}

export const initUserModel = (sequelize: Sequelize): typeof User => {
  User.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      address: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        comment: 'Crypto wallet address',
      },
      depositAddress: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        comment: 'Deposit crypto address (64 characters)',
      },
      balanceXNO: {
        type: DataTypes.DECIMAL(30, 10),
        allowNull: false,
        defaultValue: 0,
        comment: 'XNO balance',
      },
      balanceBAN: {
        type: DataTypes.DECIMAL(30, 10),
        allowNull: false,
        defaultValue: 0,
        comment: 'BAN balance',
      },
      balanceXRO: {
        type: DataTypes.DECIMAL(30, 10),
        allowNull: false,
        defaultValue: 0,
        comment: 'XRO balance',
      },
      balanceANA: {
        type: DataTypes.DECIMAL(30, 10),
        allowNull: false,
        defaultValue: 0,
        comment: 'ANA balance',
      },
      balanceXDG: {
        type: DataTypes.DECIMAL(30, 10),
        allowNull: false,
        defaultValue: 0,
        comment: 'XDG balance',
      },
      balanceNANUSD: {
        type: DataTypes.DECIMAL(30, 10),
        allowNull: false,
        defaultValue: 0,
        comment: 'nanUSD balance',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'users',
      timestamps: false,
    }
  );

  return User;
};
