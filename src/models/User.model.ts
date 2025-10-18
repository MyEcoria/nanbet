import { DataTypes, Model, Sequelize } from 'sequelize';
import { UserAttributes, UserCreationAttributes } from '../types/models.types';

export class User extends Model<UserAttributes, UserCreationAttributes> {
  declare id: string;
  declare address: string;
  declare createdAt: Date;
}

export const initUserModel = (sequelize: Sequelize): typeof User => {
  User.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      address: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        comment: 'Crypto wallet address'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      sequelize,
      tableName: 'users',
      timestamps: false
    }
  );

  return User;
};
