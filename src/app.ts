import cookieParser from 'cookie-parser';
import express, { type Application, type Request, type Response } from 'express';
import { sequelize } from './config/database';
import userRoutes from './routes/user.routes';
import { websocketService } from './services/websocket.service';
import { logger } from './utils/logger';

const app: Application = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/user', userRoutes);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const startServer = async () => {
  try {
    await sequelize.sync({ alter: true });
    logger.info('Database synchronized');

    await websocketService.initialize();
    logger.info('WebSocket connections initialized');

    await websocketService.subscribeToUserDeposits();
    logger.info('User deposit addresses subscribed');

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};

startServer();

process.on('SIGINT', () => {
  logger.info('Shutting down gracefully');
  websocketService.closeAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully');
  websocketService.closeAll();
  process.exit(0);
});

export default app;
