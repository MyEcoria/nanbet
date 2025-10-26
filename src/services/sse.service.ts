import type { Response } from 'express';
import type { SSEClient } from '../types/sse.types';
import { logger } from '../utils/logger';

const clients: Map<string, SSEClient> = new Map();
let heartbeatInterval: NodeJS.Timeout | null = null;

// Stockage des authentifications récentes (sessionId -> {account, authToken, timestamp})
interface RecentAuth {
  account: string;
  authToken: string;
  timestamp: number;
}
const recentAuthentications: Map<string, RecentAuth> = new Map();
const AUTH_CACHE_DURATION = 100000; // 10 secondes

function startHeartbeat(): void {
  heartbeatInterval = setInterval(() => {
    const now = new Date();

    clients.forEach((client, sessionId) => {
      try {
        client.response.write(': heartbeat\n\n');
        client.lastHeartbeat = now;
      } catch (error) {
        logger.error(`Heartbeat failed for session ${sessionId}`, { error });
        removeClient(sessionId);
      }
    });
  }, 30000);
}

export function addClient(sessionId: string, res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  clients.set(sessionId, {
    sessionId,
    response: res,
    lastHeartbeat: new Date(),
  });

  // Vérifier s'il y a une authentification récente pour cette session
  const recentAuth = recentAuthentications.get(sessionId);
  const now = Date.now();

  if (recentAuth && (now - recentAuth.timestamp) <= AUTH_CACHE_DURATION) {
    // Envoyer immédiatement l'événement d'authentification
    logger.info(`Sending cached auth for session ${sessionId}`);
    sendEvent(sessionId, 'authenticated', {
      account: recentAuth.account,
      authToken: recentAuth.authToken,
      timestamp: new Date(recentAuth.timestamp).toISOString(),
    });
  } else {
    // Envoyer l'événement de connexion normal
    sendEvent(sessionId, 'connected', {
      message: 'SSE connection established',
      sessionId,
    });
  }

  if (!heartbeatInterval) {
    startHeartbeat();
  }

  res.on('close', () => {
    removeClient(sessionId);
  });
}

export function removeClient(sessionId: string): void {
  const client = clients.get(sessionId);
  if (client) {
    client.response.end();
    clients.delete(sessionId);
  }

  if (clients.size === 0 && heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

export function sendEvent(
  sessionId: string,
  eventType: string,
  data: Record<string, unknown>
): boolean {
  const client = clients.get(sessionId);
  if (!client) {
    return false;
  }

  try {
    const payload = {
      type: eventType,
      ...data,
    };
    const message = `data: ${JSON.stringify(payload)}\n\n`;
    client.response.write(message);
    return true;
  } catch (error) {
    logger.error(`Error sending SSE event to ${sessionId}`, { error });
    removeClient(sessionId);
    return false;
  }
}

export function sendAuthenticatedEvent(
  sessionId: string,
  account: string,
  authToken: string
): boolean {
  // Stocker l'authentification dans le cache
  recentAuthentications.set(sessionId, {
    account,
    authToken,
    timestamp: Date.now(),
  });

  // Nettoyer le cache après la durée d'expiration
  setTimeout(() => {
    const cached = recentAuthentications.get(sessionId);
    if (cached && (Date.now() - cached.timestamp) >= AUTH_CACHE_DURATION) {
      recentAuthentications.delete(sessionId);
    }
  }, AUTH_CACHE_DURATION);

  const success = sendEvent(sessionId, 'authenticated', {
    account,
    authToken,
    timestamp: new Date().toISOString(),
  });

  if (success) {
    setTimeout(() => removeClient(sessionId), 1000);
  }

  return success;
}

export function sendErrorEvent(sessionId: string, error: string): boolean {
  return sendEvent(sessionId, 'error', {
    error,
    timestamp: new Date().toISOString(),
  });
}

export function isClientConnected(sessionId: string): boolean {
  return clients.has(sessionId);
}

export function getActiveConnections(): number {
  return clients.size;
}

export function broadcastToAll(eventType: string, data: Record<string, unknown>): void {
  const payload = {
    type: eventType,
    ...data,
  };
  const message = `data: ${JSON.stringify(payload)}\n\n`;

  clients.forEach((client, sessionId) => {
    try {
      client.response.write(message);
    } catch (error) {
      logger.error(`Error broadcasting to session ${sessionId}`, { error });
      removeClient(sessionId);
    }
  });

  logger.info(`Broadcasted ${eventType} to ${clients.size} clients`);
}
