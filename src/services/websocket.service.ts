import ReconnectingWebSocket from 'reconnecting-websocket';
import WS from 'ws';
import wallets from '../config/wallets';
import { User } from '../models/User.model';
import { sendFeeless } from '../utils/nanswap_wallet';
import { sequelize } from '../config/database';

interface WebSocketConnection {
  ticker: string;
  ws: ReconnectingWebSocket;
  isConnected: boolean;
}

class WebSocketService {
  private connections: Map<string, WebSocketConnection> = new Map();

  /**
   * Initialize all WebSocket connections for all configured wallets
   */
  public async initialize(): Promise<void> {
    console.log('Initializing WebSocket connections...');

    for (const [ticker, config] of Object.entries(wallets)) {
      // Each wallet can have multiple WS endpoints, but we'll use the first one
      const wsUrl = config.WS[0];

      console.log(`Connecting to ${ticker} WebSocket at ${wsUrl}`);

      // Create reconnecting WebSocket
      const ws = new ReconnectingWebSocket(wsUrl, [], {
        WebSocket: WS,
        connectionTimeout: 10000,
        maxRetries: 10,
        maxReconnectionDelay: 10000,
        minReconnectionDelay: 1000,
      });

      // Set binaryType for Node.js WebSocket (not 'blob' which is for browsers)
      ws.binaryType = 'nodebuffer';

      // Setup event handlers
      this.setupEventHandlers(ticker, ws);

      // Store connection
      this.connections.set(ticker, {
        ticker,
        ws,
        isConnected: false,
      });
    }

    console.log(`WebSocket service initialized with ${this.connections.size} connections`);
  }

  /**
   * Process a deposit confirmation
   */
  private async processDeposit(ticker: string, message: any): Promise<void> {
    try {
      const account = message.message.account;
      const amount = message.message.amount;
      const hash = message.message.hash;
      const subtype = message.message.block?.subtype;

      // Check if this is a receive transaction
      if (subtype !== 'receive') {
        return;
      }

      // Get wallet config
      const walletConfig = wallets[ticker];
      if (!walletConfig) {
        console.error(`[${ticker}] Unknown wallet configuration`);
        return;
      }

      // Check if this is the hot wallet (ignore deposits to hot wallet)
      if (account === walletConfig.mainAccountHot) {
        console.log(`[${ticker}] Deposit to hot wallet ignored (hash: ${hash})`);
        return;
      }

      console.log(`[${ticker}] Processing deposit: ${amount} raw to ${account}`);

      // Convert account to nan_ prefix to find user
      const depositAddress = account.replace(/^[a-z]+_/, 'nan_');

      // Find user by deposit address
      const user = await User.findOne({ where: { depositAddress } });

      if (!user) {
        console.error(`[${ticker}] User not found for deposit address: ${depositAddress}`);
        return;
      }

      // Convert raw to mega
      const megaAmount = walletConfig.converter.rawToMega(amount);
      console.log(`[${ticker}] Converted amount: ${megaAmount} ${ticker} (from ${amount} raw)`);

      // Update user balance in a transaction
      await sequelize.transaction(async (t) => {
        // Determine which balance field to update
        const balanceField = `balance${ticker}` as keyof User;
        const currentBalance = parseFloat(user[balanceField] as any) || 0;
        const newBalance = currentBalance + parseFloat(megaAmount);

        await user.update(
          { [balanceField]: newBalance },
          { transaction: t }
        );

        console.log(`[${ticker}] User ${user.id} balance updated: ${currentBalance} -> ${newBalance}`);
      });

      // Send funds to hot wallet
      console.log(`[${ticker}] Sending ${amount} raw from ${account} to hot wallet ${walletConfig.mainAccountHot}`);
      const blockHash = await sendFeeless(ticker, account, walletConfig.mainAccountHot, amount);

      if (blockHash) {
        console.log(`[${ticker}] Funds sent to hot wallet. Block hash: ${blockHash}`);
      } else {
        console.error(`[${ticker}] Failed to send funds to hot wallet`);
      }
    } catch (error) {
      console.error(`[${ticker}] Error processing deposit:`, error);
    }
  }

  /**
   * Setup event handlers for a WebSocket connection
   */
  private setupEventHandlers(ticker: string, ws: ReconnectingWebSocket): void {
    ws.addEventListener('open', () => {
      console.log(`[${ticker}] WebSocket connected`);
      const connection = this.connections.get(ticker);
      if (connection) {
        connection.isConnected = true;
      }
    });

    ws.addEventListener('message', (event) => {
      const dataStr = event.data.toString();

      // Try to parse JSON if possible
      try {
        const data = JSON.parse(dataStr);
        console.log(`[${ticker}] <<<< Received:`, data);

        // Check if this is a confirmation message
        if (data.topic === 'confirmation' && data.message) {
          // Process deposit asynchronously (don't block the event handler)
          this.processDeposit(ticker, data).catch(err => {
            console.error(`[${ticker}] Error in processDeposit:`, err);
          });
        }
      } catch (error) {
        // If not JSON, just log the raw message
        console.log(`[${ticker}] <<<< Received (not JSON):`, dataStr);
      }
    });

    ws.addEventListener('error', (error) => {
      console.error(`[${ticker}] !!!! WebSocket error:`, error);
    });

    ws.addEventListener('close', (event) => {
      console.log(`[${ticker}] WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
      const connection = this.connections.get(ticker);
      if (connection) {
        connection.isConnected = false;
      }
    });
  }

  /**
   * Get a WebSocket connection by ticker
   */
  public getConnection(ticker: string): WebSocketConnection | undefined {
    return this.connections.get(ticker);
  }

  /**
   * Get all connections
   */
  public getAllConnections(): Map<string, WebSocketConnection> {
    return this.connections;
  }

  /**
   * Check if a specific connection is ready
   */
  public isConnected(ticker: string): boolean {
    const connection = this.connections.get(ticker);
    return connection?.isConnected ?? false;
  }

  /**
   * Send a message to a specific ticker's WebSocket
   */
  public sendMessage(ticker: string, message: string | object): void {
    const connection = this.connections.get(ticker);

    if (!connection) {
      throw new Error(`No connection found for ticker: ${ticker}`);
    }

    if (!connection.isConnected) {
      throw new Error(`Connection for ${ticker} is not ready`);
    }

    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    connection.ws.send(messageStr);
    console.log(`[${ticker}] Sent message:`, messageStr);
  }

  /**
   * Add a new deposit address to all cryptocurrency WebSocket subscriptions
   */
  public async addDepositAddress(depositAddress: string): Promise<void> {
    console.log(`Adding new deposit address to WebSocket subscriptions: ${depositAddress}`);

    // For each cryptocurrency
    for (const [ticker, config] of Object.entries(wallets)) {
      const prefix = config.prefix;

      // Convert deposit address to this crypto's prefix
      const address = depositAddress.replace(/^nan_/, `${prefix}_`);

      // Create update message to add the account
      const updateMessage = {
        action: 'subscribe',
        topic: 'confirmation',
        options: {
          accounts: [address]
        }
      };

      // Check if connection is ready
      if (!this.isConnected(ticker)) {
        console.warn(`[${ticker}] Connection not ready, skipping address addition`);
        continue;
      }

      // Send update message
      try {
        this.sendMessage(ticker, updateMessage);
        console.log(`[${ticker}] Added address to subscription: ${address}`);
      } catch (error) {
        console.error(`[${ticker}] Failed to add address:`, error);
      }
    }

    console.log('Deposit address added to all WebSocket subscriptions');
  }

  /**
   * Subscribe to all user deposit addresses and main hot wallets across all cryptos
   */
  public async subscribeToUserDeposits(): Promise<void> {
    console.log('Subscribing to user deposit addresses and main hot wallets...');

    try {
      // Get all users with their deposit addresses
      const users = await User.findAll({
        attributes: ['depositAddress']
      });

      console.log(`Found ${users.length} users to subscribe`);

      // For each cryptocurrency
      for (const [ticker, config] of Object.entries(wallets)) {
        const prefix = config.prefix;
        const addresses: string[] = [];

        // Always add the main hot wallet
        addresses.push(config.mainAccountHot);

        // Add all user deposit addresses if there are users
        if (users.length > 0) {
          const userAddresses = users.map(user => {
            // Replace 'nan_' prefix with the crypto's prefix
            return user.depositAddress.replace(/^nan_/, `${prefix}_`);
          });
          addresses.push(...userAddresses);
        }

        // Subscribe to confirmations for these addresses
        const subscriptionMessage = {
          action: 'subscribe',
          topic: 'confirmation',
          options: {
            accounts: addresses
          }
        };

        // Wait for connection to be ready
        let retries = 0;
        const maxRetries = 50; // 5 seconds max
        while (!this.isConnected(ticker) && retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 100));
          retries++;
        }

        if (!this.isConnected(ticker)) {
          console.warn(`[${ticker}] Connection not ready after ${maxRetries * 100}ms, skipping subscription`);
          continue;
        }

        // Send subscription
        this.sendMessage(ticker, subscriptionMessage);
        console.log(`[${ticker}] Subscribed to ${addresses.length} addresses (1 hot wallet + ${users.length} user deposits)`);
      }

      console.log('All subscriptions sent successfully');
    } catch (error) {
      console.error('Error subscribing to user deposits:', error);
      throw error;
    }
  }

  /**
   * Close all WebSocket connections
   */
  public closeAll(): void {
    console.log('Closing all WebSocket connections...');
    for (const [ticker, connection] of this.connections) {
      connection.ws.close();
      console.log(`[${ticker}] Connection closed`);
    }
    this.connections.clear();
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
