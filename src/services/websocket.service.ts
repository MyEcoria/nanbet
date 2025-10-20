import ReconnectingWebSocket from 'reconnecting-websocket';
import WS from 'ws';
import { sequelize } from '../config/database';
import wallets from '../config/wallets';
import { User } from '../models/User.model';
import type {
  ConfirmationMessage,
  SubscriptionMessage,
  WebSocketConnection,
} from '../types/websocket.types';
import { logger } from '../utils/logger';
import { sendFeeless } from '../utils/nanswap_wallet';

class WebSocketService {
  private connections: Map<string, WebSocketConnection> = new Map();

  public async initialize(): Promise<void> {
    logger.info('Initializing WebSocket connections');

    for (const [ticker, config] of Object.entries(wallets)) {
      const wsUrl = config.WS[0];

      logger.info(`Connecting to ${ticker} WebSocket`);

      const ws = new ReconnectingWebSocket(wsUrl, [], {
        WebSocket: WS,
        connectionTimeout: 10000,
        maxRetries: 10,
        maxReconnectionDelay: 10000,
        minReconnectionDelay: 1000,
      });

      ws.binaryType = 'nodebuffer';

      this.setupEventHandlers(ticker, ws);

      this.connections.set(ticker, {
        ticker,
        ws,
        isConnected: false,
      });
    }

    logger.info(`WebSocket service initialized with ${this.connections.size} connections`);
  }

  private async processDeposit(ticker: string, message: ConfirmationMessage): Promise<void> {
    try {
      const account = message.message.account;
      const amount = message.message.amount;
      const hash = message.message.hash;
      const subtype = message.message.block?.subtype;

      if (subtype !== 'receive') {
        return;
      }

      const walletConfig = wallets[ticker];
      if (!walletConfig) {
        logger.error(`[${ticker}] Unknown wallet configuration`);
        return;
      }

      if (account === walletConfig.mainAccountHot) {
        logger.info(`[${ticker}] Deposit to hot wallet ignored`, { hash });
        return;
      }

      logger.info(`[${ticker}] Processing deposit`, { amount, account });

      const depositAddress = account.replace(/^[a-z]+_/, 'nan_');

      const user = await User.findOne({ where: { depositAddress } });

      if (!user) {
        logger.error(`[${ticker}] User not found for deposit`, { depositAddress });
        return;
      }

      const megaAmount = walletConfig.converter.rawToMega(amount);
      logger.info(`[${ticker}] Amount converted`, { megaAmount, ticker });

      await sequelize.transaction(async (t) => {
        const balanceField = `balance${ticker}` as keyof User;
        const currentBalance = parseFloat(String(user[balanceField] ?? 0));
        const newBalance = currentBalance + parseFloat(String(megaAmount));

        await user.update({ [balanceField]: newBalance }, { transaction: t });

        logger.info(`[${ticker}] User balance updated`, {
          userId: user.id,
          previousBalance: currentBalance,
          newBalance,
        });
      });

      logger.info(`[${ticker}] Sending funds to hot wallet`, { amount });
      const blockHash = await sendFeeless(ticker, account, walletConfig.mainAccountHot, amount);

      if (blockHash) {
        logger.info(`[${ticker}] Funds sent to hot wallet`, { blockHash });
      } else {
        logger.error(`[${ticker}] Failed to send funds to hot wallet`);
      }
    } catch (error) {
      logger.error(`[${ticker}] Error processing deposit`, { error });
    }
  }

  private setupEventHandlers(ticker: string, ws: ReconnectingWebSocket): void {
    ws.addEventListener('open', () => {
      logger.info(`[${ticker}] WebSocket connected`);
      const connection = this.connections.get(ticker);
      if (connection) {
        connection.isConnected = true;
      }
    });

    ws.addEventListener('message', (event) => {
      const dataStr = event.data.toString();

      try {
        const data = JSON.parse(dataStr);

        if (data.topic === 'confirmation' && data.message) {
          this.processDeposit(ticker, data).catch((err) => {
            logger.error(`[${ticker}] Error in processDeposit`, { error: err });
          });
        }
      } catch (_error) {
        logger.warn(`[${ticker}] Received non-JSON message`);
      }
    });

    ws.addEventListener('error', (error) => {
      logger.error(`[${ticker}] WebSocket error`, { error });
    });

    ws.addEventListener('close', (event) => {
      logger.warn(`[${ticker}] WebSocket closed`, { code: event.code, reason: event.reason });
      const connection = this.connections.get(ticker);
      if (connection) {
        connection.isConnected = false;
      }
    });
  }

  public getConnection(ticker: string): WebSocketConnection | undefined {
    return this.connections.get(ticker);
  }

  public getAllConnections(): Map<string, WebSocketConnection> {
    return this.connections;
  }

  public isConnected(ticker: string): boolean {
    const connection = this.connections.get(ticker);
    return connection?.isConnected ?? false;
  }

  public sendMessage(ticker: string, message: SubscriptionMessage): void {
    const connection = this.connections.get(ticker);

    if (!connection) {
      throw new Error(`No connection found for ticker: ${ticker}`);
    }

    if (!connection.isConnected) {
      throw new Error(`Connection for ${ticker} is not ready`);
    }

    connection.ws.send(JSON.stringify(message));
  }

  public async addDepositAddress(depositAddress: string): Promise<void> {
    logger.info('Adding new deposit address to subscriptions');

    for (const [ticker, config] of Object.entries(wallets)) {
      const prefix = config.prefix;
      const address = depositAddress.replace(/^nan_/, `${prefix}_`);

      const updateMessage: SubscriptionMessage = {
        action: 'subscribe',
        topic: 'confirmation',
        options: {
          accounts: [address],
        },
      };

      if (!this.isConnected(ticker)) {
        logger.warn(`[${ticker}] Connection not ready, skipping address addition`);
        continue;
      }

      try {
        this.sendMessage(ticker, updateMessage);
        logger.info(`[${ticker}] Address added to subscription`);
      } catch (error) {
        logger.error(`[${ticker}] Failed to add address`, { error });
      }
    }

    logger.info('Deposit address added to all subscriptions');
  }

  public async subscribeToUserDeposits(): Promise<void> {
    logger.info('Subscribing to user deposit addresses and hot wallets');

    try {
      const users = await User.findAll({
        attributes: ['depositAddress'],
      });

      logger.info(`Found ${users.length} users to subscribe`);

      for (const [ticker, config] of Object.entries(wallets)) {
        const prefix = config.prefix;
        const addresses: string[] = [];

        addresses.push(config.mainAccountHot);

        if (users.length > 0) {
          const userAddresses = users.map((user) => {
            return user.depositAddress.replace(/^nan_/, `${prefix}_`);
          });
          addresses.push(...userAddresses);
        }

        const subscriptionMessage: SubscriptionMessage = {
          action: 'subscribe',
          topic: 'confirmation',
          options: {
            accounts: addresses,
          },
        };

        let retries = 0;
        const maxRetries = 50;
        while (!this.isConnected(ticker) && retries < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          retries++;
        }

        if (!this.isConnected(ticker)) {
          logger.warn(`[${ticker}] Connection not ready after ${maxRetries * 100}ms`);
          continue;
        }

        this.sendMessage(ticker, subscriptionMessage);
        logger.info(
          `[${ticker}] Subscribed to ${addresses.length} addresses (1 hot + ${users.length} users)`
        );
      }

      logger.info('All subscriptions completed');
    } catch (error) {
      logger.error('Error subscribing to user deposits', { error });
      throw error;
    }
  }

  public closeAll(): void {
    logger.info('Closing all WebSocket connections');
    for (const [ticker, connection] of this.connections) {
      connection.ws.close();
      logger.info(`[${ticker}] Connection closed`);
    }
    this.connections.clear();
  }
}

export const websocketService = new WebSocketService();
