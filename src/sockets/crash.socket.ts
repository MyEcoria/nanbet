import type { Server as HTTPServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { LoginHistory } from '../models/LoginHistory.model';
import { CrashGameService } from '../services/crash.service';
import { maintenanceService } from '../services/maintenance.service';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../types/crash.types';
import { validateAndNormalizeAmount } from '../utils/currency';
import { logger } from '../utils/logger';

export class CrashSocketHandler {
  private io: SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >;
  private crashService: CrashGameService;

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer<
      ClientToServerEvents,
      ServerToClientEvents,
      InterServerEvents,
      SocketData
    >(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      maxHttpBufferSize: 1e6,
      perMessageDeflate: {
        threshold: 1024,
      },
    });

    this.crashService = new CrashGameService(this.io);
    this.setupMiddleware();
    this.setupEventHandlers();

    logger.info('[CrashSocket] Socket.IO server initialized');
  }

  private setupMiddleware(): void {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token as string;

        if (!token) {
          logger.warn('[CrashSocket] Connection attempt without token', {
            socketId: socket.id,
          });
          return next(new Error('Authentication required'));
        }

        const session = await LoginHistory.findOne({
          where: {
            authToken: token,
            isAuthenticated: true,
          },
        });

        if (!session) {
          logger.warn('[CrashSocket] Invalid token', {
            socketId: socket.id,
          });
          return next(new Error('Invalid authentication token'));
        }

        if (new Date() > new Date(session.expiresAt)) {
          logger.warn('[CrashSocket] Expired token', {
            socketId: socket.id,
            userId: session.userId,
          });
          return next(new Error('Session expired'));
        }

        if (!session.userId) {
          logger.warn('[CrashSocket] Session without userId', {
            socketId: socket.id,
          });
          return next(new Error('Invalid session'));
        }

        socket.data.userId = session.userId;
        socket.data.sessionId = session.sessionId;

        logger.info('[CrashSocket] User authenticated', {
          socketId: socket.id,
          userId: session.userId,
        });

        next();
      } catch (error) {
        logger.error('[CrashSocket] Authentication error', { error });
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      const userId = socket.data.userId;

      logger.info('[CrashSocket] User connected', {
        socketId: socket.id,
        userId,
      });

      socket.join(`user:${userId}`);

      this.sendGameState(socket.id, userId).catch((error) => {
        logger.error('[CrashSocket] Error sending game state', { error });
      });

      socket.on('bet:place', async (data, callback) => {
        try {
          // Check if maintenance is active
          const isMaintenanceActive = await maintenanceService.isMaintenanceActive();
          if (isMaintenanceActive) {
            const status = await maintenanceService.getStatus();
            callback({
              success: false,
              error: status.message || 'Casino is under maintenance',
              code: 'MAINTENANCE_MODE',
            });
            return;
          }

          logger.info('[CrashSocket] Bet placement request', {
            userId,
            amount: data.amount,
            currency: data.currency,
          });

          const currency = data.currency?.toUpperCase();
          const validation = validateAndNormalizeAmount(data.amount, currency);

          if (!validation.valid) {
            callback({
              success: false,
              error: validation.error || 'Invalid bet parameters',
              code: 'INVALID_BET',
            });
            return;
          }

          if (!validation.normalizedAmount) {
            callback({
              success: false,
              error: 'Invalid bet amount',
              code: 'INVALID_AMOUNT',
            });
            return;
          }

          const result = await this.crashService.placeBet(
            userId,
            validation.normalizedAmount,
            currency
          );

          callback(result);

          if (!result.success) {
            socket.emit('bet:error', {
              message: result.error || 'Failed to place bet',
              code: result.code || 'UNKNOWN',
            });
          }
        } catch (error) {
          logger.error('[CrashSocket] Error placing bet', { error, userId });
          callback({
            success: false,
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
          });
        }
      });

      socket.on('bet:cashout', async (callback) => {
        try {
          logger.info('[CrashSocket] Cashout request', { userId });

          const result = await this.crashService.cashOut(userId);

          callback(result);

          if (!result.success) {
            socket.emit('bet:error', {
              message: result.error || 'Failed to cash out',
              code: result.code || 'UNKNOWN',
            });
          }
        } catch (error) {
          logger.error('[CrashSocket] Error cashing out', { error, userId });
          callback({
            success: false,
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
          });
        }
      });

      socket.on('game:getState', async (callback) => {
        try {
          const state = await this.crashService.getCurrentGameState();

          if (!state) {
            callback({
              success: false,
              error: 'No active game',
            });
            return;
          }

          callback({
            success: true,
            state,
          });
        } catch (error) {
          logger.error('[CrashSocket] Error getting game state', { error });
          callback({
            success: false,
            error: 'Failed to get game state',
          });
        }
      });

      socket.on('game:getHistory', async (limit, callback) => {
        try {
          const safeLimit = Math.min(Math.max(1, limit || 10), 100);

          const games = await this.crashService.getGameHistory(safeLimit);

          callback({
            success: true,
            games,
          });
        } catch (error) {
          logger.error('[CrashSocket] Error getting game history', { error });
          callback({
            success: false,
            error: 'Failed to get game history',
          });
        }
      });

      socket.on('disconnect', (reason) => {
        logger.info('[CrashSocket] User disconnected', {
          socketId: socket.id,
          userId,
          reason,
        });
      });

      socket.on('error', (error) => {
        logger.error('[CrashSocket] Socket error', {
          socketId: socket.id,
          userId,
          error,
        });
      });
    });

    this.io.engine.on('connection_error', (error) => {
      logger.error('[CrashSocket] Connection error', { error });
    });
  }

  private async sendGameState(socketId: string, userId: string): Promise<void> {
    try {
      const state = await this.crashService.getCurrentGameState(userId);

      if (state) {
        this.io.to(socketId).emit('game:state', state);
      }
    } catch (error) {
      logger.error('[CrashSocket] Error sending game state', { error });
    }
  }

  public async start(): Promise<void> {
    logger.info('[CrashSocket] Starting crash game service');
    await this.crashService.start();

    setInterval(() => {
      this.crashService.cleanupRateLimits();
    }, 60000);
  }

  public stop(): void {
    logger.info('[CrashSocket] Stopping crash game service');
    this.crashService.stop();
    this.io.close();
  }

  public getIO(): SocketIOServer {
    return this.io;
  }

  public getCrashService(): CrashGameService {
    return this.crashService;
  }
}
