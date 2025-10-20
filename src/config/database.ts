import { Sequelize } from 'sequelize';
import { initLoginHistoryModel, LoginHistory } from '../models/LoginHistory.model';
import { initUserModel, User } from '../models/User.model';

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  logging: false,
});

// Initialize models
initUserModel(sequelize);
initLoginHistoryModel(sequelize);

// Define associations
User.hasMany(LoginHistory, {
  foreignKey: 'userId',
  as: 'loginHistory',
});

LoginHistory.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
});

export { sequelize, User, LoginHistory };
