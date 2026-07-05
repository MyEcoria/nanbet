import type { Socket, Server as SocketIOServer } from 'socket.io';
import { sportsService } from '../services/sports.service';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../types/crash.types';
import { validateAndNormalizeAmount } from '../utils/currency';
import { logger } from '../utils/logger';

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type TypedServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export function registerSportsHandlers(io: TypedServer, socket: TypedSocket, userId: string): void {
  sportsService
    .listMatches()
    .then((matches) => {
      io.to(socket.id).emit('sports:matches', matches);
    })
    .catch((error) => {
      logger.error('[SportsSocket] Error sending initial matches', { error, userId });
    });

  socket.on('sports:bet:place', async (data, callback) => {
    try {
      const currency = data.currency?.toUpperCase();
      const validation = validateAndNormalizeAmount(data.amount, currency);

      if (!validation.valid || !validation.normalizedAmount) {
        callback({
          success: false,
          error: validation.error || 'Invalid bet parameters',
          code: 'INVALID_BET',
        });
        return;
      }

      if (!['home', 'draw', 'away'].includes(data.outcome)) {
        callback({ success: false, error: 'Invalid outcome', code: 'INVALID_OUTCOME' });
        return;
      }

      const result = await sportsService.placeBet(
        userId,
        data.matchId,
        data.outcome,
        validation.normalizedAmount,
        currency
      );

      callback(result);
    } catch (error) {
      logger.error('[SportsSocket] Error placing sports bet', { error, userId });
      callback({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });
}
