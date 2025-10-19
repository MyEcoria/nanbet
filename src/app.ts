import express, { Application, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import userRoutes from './routes/user.routes';
import { sequelize } from './config/database';
import { websocketService } from './services/websocket.service';

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes
app.use('/user', userRoutes);

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Sync database
    await sequelize.sync({ alter: true });
    console.log('Database synchronized');

    // Initialize WebSocket connections
    await websocketService.initialize();
    console.log('WebSocket connections initialized');

    // Subscribe to all user deposit addresses
    await websocketService.subscribeToUserDeposits();
    console.log('User deposit addresses subscribed');

    // Start server
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  websocketService.closeAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  websocketService.closeAll();
  process.exit(0);
});

export default app;
