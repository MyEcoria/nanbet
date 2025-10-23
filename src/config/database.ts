import { Sequelize } from 'sequelize';
import { CrashBet, initCrashBetModel } from '../models/CrashBet.model';
import { CrashGame, initCrashGameModel } from '../models/CrashGame.model';
import { initLoginHistoryModel, LoginHistory } from '../models/LoginHistory.model';
import { initUserModel, User } from '../models/User.model';
import { initWithdrawalModel, Withdrawal } from '../models/Withdrawal.model';
import { logger } from '../utils/logger';

// Database configuration from environment variables
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
const DB_NAME = process.env.DB_NAME || 'nanbet';
const DB_USER = process.env.DB_USER || 'nanbet';
const DB_PASSWORD = process.env.DB_PASSWORD || 'nanbet';

const sequelize = new Sequelize({
  dialect: 'mysql', // Use mysql dialect with mysql2 driver (works with MariaDB)
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  username: DB_USER,
  password: DB_PASSWORD,
  logging: (msg) => logger.debug(msg),
  pool: {
    max: 10,
    min: 2,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
  },
});


initUserModel(sequelize);
initLoginHistoryModel(sequelize);
initCrashGameModel(sequelize);
initCrashBetModel(sequelize);
initWithdrawalModel(sequelize);


User.hasMany(LoginHistory, {
  foreignKey: 'userId',
  as: 'loginHistory',
});

LoginHistory.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
});


CrashGame.hasMany(CrashBet, {
  foreignKey: 'gameId',
  as: 'bets',
});

CrashBet.belongsTo(CrashGame, {
  foreignKey: 'gameId',
  as: 'game',
});

User.hasMany(CrashBet, {
  foreignKey: 'userId',
  as: 'crashBets',
});

CrashBet.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
});

// Withdrawal - User relationship
User.hasMany(Withdrawal, {
  foreignKey: 'userId',
  as: 'withdrawals',
});

Withdrawal.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
});

export { sequelize, User, LoginHistory, CrashGame, CrashBet, Withdrawal };
