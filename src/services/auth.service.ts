import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { tools } from 'nanocurrency-web';
import { User, LoginHistory } from '../config/database';
import { CallbackRequest } from '../types/auth.types';
import { SSEService } from './sse.service';
import { Op } from 'sequelize';
import { create_account } from '../utils/nanswap_wallet';
import { websocketService } from './websocket.service';

export class AuthService {
  /**
   * Initiate authentication session
   * Creates a session with unique ID and message to sign
   */
  static async initiateSession(ipAddress: string): Promise<{
    sessionId: string;
    message: string;
    expiresAt: Date;
    expiresIn: number;
  }> {
    const sessionId = uuidv4();
    const timestamp = Date.now();
    const message = `Login-${sessionId}-${timestamp}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Create session in database
    await LoginHistory.create({
      sessionId,
      message,
      userId: null,
      ipAddress,
      validityHours: 24,
      isAuthenticated: false,
      authToken: null,
      expiresAt,
      createdAt: new Date()
    });

    return {
      sessionId,
      message,
      expiresAt,
      expiresIn: 300 // 5 minutes in seconds
    };
  }

  /**
   * Verify nano signature using nanocurrency-web
   */
  static verifySignature(data: CallbackRequest, expectedMessage: string): boolean {
    try {
      // The message in callback comes with "Signed Message: " prefix
      const expectedWithPrefix = `Signed Message: ${expectedMessage}`;

      if (data.message !== expectedWithPrefix) {
        return false;
      }

      if (data.signatureType !== 'nanocurrency-web') {
        return false;
      }

      // Validate signature format (128 hex characters)
      if (!data.signature || data.signature.length !== 128) {
        return false;
      }

      // Infer public key from nano address
      const publicKey = tools.addressToPublicKey(data.account);

      // Verify the signature using the public key, signature and original message
      const isValid = tools.verify(publicKey, data.signature, expectedMessage);

      return isValid;
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Generate authentication token
   */
  private static generateAuthToken(userId: string, address: string): string {
    const payload = {
      userId,
      address,
      timestamp: Date.now()
    };

    // Simple token generation - in production use JWT
    const token = crypto
      .createHash('sha256')
      .update(JSON.stringify(payload) + process.env.SECRET_KEY || 'default-secret')
      .digest('hex');

    return token;
  }

  /**
   * Process callback and authenticate session
   */
  static async processCallback(
    data: CallbackRequest,
    ipAddress: string
  ): Promise<{ success: boolean; userId?: string; sessionId?: string; message: string }> {
    try {
      // Extract original message from "Signed Message: <message>" format
      const messageMatch = data.message.match(/^Signed Message: (.+)$/);
      if (!messageMatch) {
        return { success: false, message: 'Invalid message format' };
      }
      const originalMessage = messageMatch[1];

      // Find session by original message
      const session = await LoginHistory.findOne({
        where: {
          message: originalMessage,
          isAuthenticated: false
        }
      });

      if (!session) {
        return { success: false, message: 'Session not found or already authenticated' };
      }

      // Check if session expired
      if (new Date() > session.expiresAt) {
        return { success: false, message: 'Session expired' };
      }

      // Verify signature
      if (!this.verifySignature(data, session.message)) {
        return { success: false, message: 'Invalid signature' };
      }

      // Find or create user
      let user = await User.findOne({ where: { address: data.account } });

      if (!user) {
        // Create deposit account via nanswap_wallet
        const depositAddress = await create_account();

        user = await User.create({
          address: data.account,
          depositAddress: depositAddress,
          createdAt: new Date()
        });

        // Subscribe to this deposit address on all WebSocket connections
        await websocketService.addDepositAddress(depositAddress);
      }

      // Generate auth token
      const authToken = this.generateAuthToken(user.id, user.address);

      // Update session
      await session.update({
        userId: user.id,
        isAuthenticated: true,
        authToken
      });

      // Send SSE event to connected client
      SSEService.sendAuthenticatedEvent(session.sessionId, user.address, authToken);

      return {
        success: true,
        userId: user.id,
        sessionId: session.sessionId,
        message: 'Authentication successful'
      };
    } catch (error) {
      console.error('Error processing callback:', error);
      return { success: false, message: 'Internal server error' };
    }
  }

  /**
   * Validate session exists and is not expired
   */
  static async validateSession(sessionId: string): Promise<{
    valid: boolean;
    session?: LoginHistory;
    message: string;
  }> {
    const session = await LoginHistory.findOne({
      where: { sessionId }
    });

    if (!session) {
      return { valid: false, message: 'Session not found' };
    }

    if (new Date() > session.expiresAt) {
      return { valid: false, message: 'Session expired' };
    }

    return { valid: true, session, message: 'Session valid' };
  }

  /**
   * Cleanup expired sessions (to be run periodically)
   */
  static async cleanupExpiredSessions(): Promise<number> {
    const result = await LoginHistory.destroy({
      where: {
        expiresAt: {
          [Op.lt]: new Date()
        },
        isAuthenticated: false
      }
    });

    return result;
  }
}
