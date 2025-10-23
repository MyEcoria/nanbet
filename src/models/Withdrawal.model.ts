import { DataTypes, Model, type Sequelize } from 'sequelize';
import type { WithdrawalAttributes, WithdrawalCreationAttributes } from '../types/models.types';

export class Withdrawal extends Model<WithdrawalAttributes, WithdrawalCreationAttributes> {
  declare id: string;
  declare userId: string;
  declare currency: string;
  declare amount: number;
  declare destinationAddress: string;
  declare status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  declare transactionHash: string | null;
  declare failureReason: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
  declare processedAt: Date | null;
}

export const initWithdrawalModel = (sequelize: Sequelize): typeof Withdrawal => {
  Withdrawal.init(
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
        comment: 'Reference to the user who requested the withdrawal',
      },
      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        comment: 'Currency symbol (XNO, BAN, XRO, etc.)',
      },
      amount: {
        type: DataTypes.DECIMAL(30, 10),
        allowNull: false,
        comment: 'Withdrawal amount in the currency',
      },
      destinationAddress: {
        type: DataTypes.STRING(65),
        allowNull: false,
        comment: 'Destination crypto address for withdrawal',
      },
      status: {
        type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'Status of the withdrawal',
      },
      transactionHash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: 'Blockchain transaction hash when completed',
      },
      failureReason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Reason for failure if status is failed',
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
      processedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Timestamp when the withdrawal was processed',
      },
    },
    {
      sequelize,
      tableName: 'withdrawals',
      timestamps: true,
      indexes: [
        {
          fields: ['userId'],
        },
        {
          fields: ['status'],
        },
        {
          fields: ['createdAt'],
        },
      ],
    }
  );

  return Withdrawal;
};
