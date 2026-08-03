require('dotenv/config');

const config = {
  dialect: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  database: process.env.DB_NAME || 'nanbet',
  username: process.env.DB_USER || 'nanbet',
  password: process.env.DB_PASSWORD || 'nanbet',
  define: {
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
  },
};

module.exports = {
  development: config,
  test: config,
  production: config,
};
