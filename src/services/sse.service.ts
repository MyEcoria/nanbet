import { Response } from 'express';

interface SSEClient {
  sessionId: string;
  response: Response;
  lastHeartbeat: Date;
}

export class SSEService {
  private static clients: Map<string, SSEClient> = new Map();
  private static heartbeatInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize SSE connection for a session
   */
  static addClient(sessionId: string, res: Response): void {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Store client
    this.clients.set(sessionId, {
      sessionId,
      response: res,
      lastHeartbeat: new Date()
    });

    // Send initial connection event
    this.sendEvent(sessionId, 'connected', {
      message: 'SSE connection established',
      sessionId
    });

    // Start heartbeat if not already running
    if (!this.heartbeatInterval) {
      this.startHeartbeat();
    }

    // Handle client disconnect
    res.on('close', () => {
      this.removeClient(sessionId);
    });
  }

  /**
   * Remove client connection
   */
  static removeClient(sessionId: string): void {
    const client = this.clients.get(sessionId);
    if (client) {
      client.response.end();
      this.clients.delete(sessionId);
    }

    // Stop heartbeat if no more clients
    if (this.clients.size === 0 && this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Send event to specific session
   */
  static sendEvent(sessionId: string, eventType: string, data: any): boolean {
    const client = this.clients.get(sessionId);
    if (!client) {
      return false;
    }

    try {
      const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
      client.response.write(payload);
      return true;
    } catch (error) {
      console.error(`Error sending SSE event to ${sessionId}:`, error);
      this.removeClient(sessionId);
      return false;
    }
  }

  /**
   * Send authenticated event and close connection
   */
  static sendAuthenticatedEvent(sessionId: string, account: string, authToken: string): boolean {
    const success = this.sendEvent(sessionId, 'authenticated', {
      account,
      authToken,
      timestamp: new Date().toISOString()
    });

    // Close connection after sending auth event
    if (success) {
      setTimeout(() => this.removeClient(sessionId), 1000);
    }

    return success;
  }

  /**
   * Send error event
   */
  static sendErrorEvent(sessionId: string, error: string): boolean {
    return this.sendEvent(sessionId, 'error', {
      error,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private static startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();

      this.clients.forEach((client, sessionId) => {
        try {
          // Send heartbeat
          client.response.write(': heartbeat\n\n');
          client.lastHeartbeat = now;
        } catch (error) {
          console.error(`Heartbeat failed for session ${sessionId}:`, error);
          this.removeClient(sessionId);
        }
      });
    }, 30000); // Every 30 seconds
  }

  /**
   * Check if a client is connected
   */
  static isClientConnected(sessionId: string): boolean {
    return this.clients.has(sessionId);
  }

  /**
   * Get number of active connections
   */
  static getActiveConnections(): number {
    return this.clients.size;
  }
}
