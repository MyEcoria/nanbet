import crypto from 'node:crypto';
import { tools } from 'nanocurrency-web';
import { Op } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import { LoginHistory, User } from '../config/database';
import type { CallbackRequest } from '../types/auth.types';
import { logger } from '../utils/logger';
import { create_account } from '../utils/nanswap_wallet';
import { sendAuthenticatedEvent } from './sse.service';
import { websocketService } from './websocket.service';

export async function initiateSession(ipAddress: string): Promise<{
  sessionId: string;
  message: string;
  expiresAt: Date;
  expiresIn: number;
}> {
  const sessionId = uuidv4();
  const timestamp = Date.now();
  const message = `Login-${sessionId}-${timestamp}`;
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await LoginHistory.create({
    sessionId,
    message,
    userId: null,
    ipAddress,
    validityHours: 24,
    isAuthenticated: false,
    authToken: null,
    expiresAt,
    createdAt: new Date(),
  });

  return {
    sessionId,
    message,
    expiresAt,
    expiresIn: 300,
  };
}

export function verifySignature(data: CallbackRequest, expectedMessage: string): boolean {
  try {
    const expectedWithPrefix = `Signed Message: ${expectedMessage}`;

    if (data.message !== expectedWithPrefix) {
      return false;
    }

    if (data.signatureType !== 'nanocurrency-web') {
      return false;
    }

    if (!data.signature || data.signature.length !== 128) {
      return false;
    }

    const publicKey = tools.addressToPublicKey(data.account);
    const isValid = tools.verify(publicKey, data.signature, expectedMessage);

    return isValid;
  } catch (error) {
    logger.error('Signature verification error', { error });
    return false;
  }
}

function generateAuthToken(userId: string, address: string): string {
  const payload = {
    userId,
    address,
    timestamp: Date.now(),
  };

  const token = crypto
    .createHash('sha256')
    .update(JSON.stringify(payload) + process.env.SECRET_KEY || 'default-secret')
    .digest('hex');

  return token;
}

export async function processCallback(
  data: CallbackRequest,
  _ipAddress: string
): Promise<{ success: boolean; userId?: string; sessionId?: string; message: string }> {
  try {
    const messageMatch = data.message.match(/^Signed Message: (.+)$/);
    if (!messageMatch) {
      return { success: false, message: 'Invalid message format' };
    }
    const originalMessage = messageMatch[1];

    const session = await LoginHistory.findOne({
      where: {
        message: originalMessage,
        isAuthenticated: false,
      },
    });

    if (!session) {
      return { success: false, message: 'Session not found or already authenticated' };
    }

    if (new Date() > session.expiresAt) {
      return { success: false, message: 'Session expired' };
    }

    if (!verifySignature(data, session.message)) {
      return { success: false, message: 'Invalid signature' };
    }

    let user = await User.findOne({ where: { address: data.account } });

    if (!user) {
      const depositAddress = await create_account();

      user = await User.create({
        address: data.account,
        depositAddress: depositAddress,
        createdAt: new Date(),
      });

      await websocketService.addDepositAddress(depositAddress);
      logger.info('New user created', { userId: user.id, address: user.address });
    }

    const authToken = generateAuthToken(user.id, user.address);

    await session.update({
      userId: user.id,
      isAuthenticated: true,
      authToken,
    });

    sendAuthenticatedEvent(session.sessionId, user.address, authToken);

    return {
      success: true,
      userId: user.id,
      sessionId: session.sessionId,
      message: 'Authentication successful',
    };
  } catch (error) {
    logger.error('Error processing callback', { error });
    return { success: false, message: 'Internal server error' };
  }
}

export async function validateSession(sessionId: string): Promise<{
  valid: boolean;
  session?: LoginHistory;
  message: string;
}> {
  const session = await LoginHistory.findOne({
    where: { sessionId },
  });

  if (!session) {
    return { valid: false, message: 'Session not found' };
  }

  if (new Date() > session.expiresAt) {
    return { valid: false, message: 'Session expired' };
  }

  return { valid: true, session, message: 'Session valid' };
}

export async function cleanupExpiredSessions(): Promise<number> {
  const result = await LoginHistory.destroy({
    where: {
      expiresAt: {
        [Op.lt]: new Date(),
      },
      isAuthenticated: false,
    },
  });

  return result;
}
