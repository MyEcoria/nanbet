import { createServer } from 'node:http';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Application, type Request, type Response } from 'express';
import { sequelize } from './config/database';
import userRoutes from './routes/user.routes';
import withdrawalRoutes from './routes/withdrawal.routes';
import { websocketService } from './services/websocket.service';
import { CrashSocketHandler } from './sockets/crash.socket';
import { logger } from './utils/logger';

const app: Application = express();
const PORT = process.env.PORT || 3000;


const httpServer = createServer(app);


app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/user', userRoutes);
app.use('/withdrawal', withdrawalRoutes);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});


let crashSocketHandler: CrashSocketHandler;

const startServer = async () => {
  try {
    await sequelize.sync({ alter: true });
    logger.info('Database synchronized');


    crashSocketHandler = new CrashSocketHandler(httpServer);
    await crashSocketHandler.start();
    logger.info('Crash game service started');

    await websocketService.initialize(crashSocketHandler.getIO());
    logger.info('WebSocket connections initialized');

    await websocketService.subscribeToUserDeposits();
    logger.info('User deposit addresses subscribed');

    httpServer.listen(PORT, () => {
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
  if (crashSocketHandler) {
    crashSocketHandler.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully');
  websocketService.closeAll();
  if (crashSocketHandler) {
    crashSocketHandler.stop();
  }
  process.exit(0);
});

export default app;
