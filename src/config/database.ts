import { Sequelize } from 'sequelize';
import { CrashBet, initCrashBetModel } from '../models/CrashBet.model';
import { CrashGame, initCrashGameModel } from '../models/CrashGame.model';
import { initLoginHistoryModel, LoginHistory } from '../models/LoginHistory.model';
import { initUserModel, User } from '../models/User.model';

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  logging: false,
});


initUserModel(sequelize);
initLoginHistoryModel(sequelize);
initCrashGameModel(sequelize);
initCrashBetModel(sequelize);


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

export { sequelize, User, LoginHistory, CrashGame, CrashBet };
