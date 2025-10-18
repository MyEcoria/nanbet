import { DataTypes, Model, Sequelize } from 'sequelize';
import { LoginHistoryAttributes, LoginHistoryCreationAttributes } from '../types/models.types';

export class LoginHistory extends Model<LoginHistoryAttributes, LoginHistoryCreationAttributes> {
  declare id: string;
  declare userId: string | null;
  declare ipAddress: string;
  declare createdAt: Date;
  declare validityHours: number;
  declare sessionId: string;
  declare message: string;
  declare isAuthenticated: boolean;
  declare authToken: string | null;
  declare expiresAt: Date;
}

export const initLoginHistoryModel = (sequelize: Sequelize): typeof LoginHistory => {
  LoginHistory.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      ipAddress: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'IP address of the user'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      validityHours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 24,
        comment: 'Validity duration in hours'
      },
      sessionId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        comment: 'Unique session identifier'
      },
      message: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Message to be signed'
      },
      isAuthenticated: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether session has been authenticated'
      },
      authToken: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'JWT or auth token after successful authentication'
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Session expiration timestamp'
      }
    },
    {
      sequelize,
      tableName: 'login_history',
      timestamps: false
    }
  );

  return LoginHistory;
};
