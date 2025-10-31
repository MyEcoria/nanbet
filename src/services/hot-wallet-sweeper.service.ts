import type { Server as SocketIOServer } from 'socket.io';
import { sequelize } from '../config/database';
import walletsConfig from '../config/wallets';
import { User } from '../models/User.model';
import type { CryptoTicker } from '../types/wallet.types';
import { logger } from '../utils/logger';
import { getAccountBalance, sendFeeless } from '../utils/nanswap_wallet';

const SWEEP_INTERVAL = (Number(process.env.SWEEP_INTERVAL) || 10) * 60 * 1000;
let io: SocketIOServer | null = null;

/**
 * Converts a generic nan_ address to a ticker-specific address
 */
function convertAddressToTicker(nanAddress: string, ticker: CryptoTicker): string {
  const addressBody = nanAddress.replace(/^nan_/, '');
  const prefix = walletsConfig[ticker].prefix;
  return `${prefix}_${addressBody}`;
}

/**
 * Sweeps a single deposit address for a specific ticker if it has a balance
 */
async function sweepDepositAddressForTicker(
  nanAddress: string,
  ticker: CryptoTicker
): Promise<void> {
  const depositAddress = convertAddressToTicker(nanAddress, ticker);

  try {
    const balanceData = await getAccountBalance(depositAddress, ticker);

    if (balanceData.balance && balanceData.balance !== '0') {
      const hotWallet = walletsConfig[ticker].mainAccountHot;
      const walletConfig = walletsConfig[ticker];

      logger.error(`UNEXPECTED BALANCE DETECTED on ${depositAddress}`, {
        ticker,
        address: depositAddress,
        balance: balanceData.balance,
        hotWallet,
      });

      const user = await User.findOne({ where: { depositAddress: nanAddress } });

      if (!user) {
        logger.error(`User not found for deposit address ${nanAddress}`);
        return;
      }

      const megaAmount = walletConfig.converter.rawToMega(balanceData.balance);
      logger.info(`[${ticker}] Amount converted`, { megaAmount, ticker });

      await sequelize.transaction(async (t) => {
        const balanceField = `balance${ticker}` as keyof User;
        const currentBalance = parseFloat(String(user[balanceField] ?? 0));
        const newBalance = currentBalance + parseFloat(String(megaAmount));

        await user.update({ [balanceField]: newBalance }, { transaction: t });

        logger.info(`[${ticker}] User balance updated (sweep)`, {
          userId: user.id,
          previousBalance: currentBalance,
          newBalance,
        });
      });

      await user.reload();

      if (io) {
        io.to(`user:${user.id}`).emit('balance:update', {
          balanceXNO: parseFloat(String(user.balanceXNO)),
          balanceBAN: parseFloat(String(user.balanceBAN)),
          balanceXRO: parseFloat(String(user.balanceXRO)),
          balanceANA: parseFloat(String(user.balanceANA)),
          balanceXDG: parseFloat(String(user.balanceXDG)),
          balanceNANUSD: parseFloat(String(user.balanceNANUSD)),
        });

        io.to(`user:${user.id}`).emit('notification', {
          type: 'deposit',
          message: `Deposit received (swept): ${megaAmount} ${ticker}`,
          amount: parseFloat(String(megaAmount)),
          currency: ticker,
          timestamp: new Date().toISOString(),
        });

        logger.info(`[${ticker}] Socket.IO notifications sent to user ${user.id} (sweep)`);
      }

      // Transfer to hot wallet
      const block = await sendFeeless(ticker, depositAddress, hotWallet, balanceData.balance);

      if (block) {
        logger.error(
          `Successfully swept ${balanceData.balance} ${ticker} from ${depositAddress} to hot wallet`,
          {
            block,
            ticker,
            amount: balanceData.balance,
            userId: user.id,
          }
        );
      } else {
        logger.error(`Failed to sweep balance from ${depositAddress}`, {
          ticker,
          balance: balanceData.balance,
          userId: user.id,
        });
      }
    }
  } catch (error) {
    logger.error(`Error sweeping deposit address ${depositAddress} for ${ticker}`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Sweeps a single deposit address for all tickers
 */
async function sweepDepositAddress(nanAddress: string): Promise<void> {
  const tickers = Object.keys(walletsConfig) as CryptoTicker[];

  await Promise.all(tickers.map((ticker) => sweepDepositAddressForTicker(nanAddress, ticker)));
}

/**
 * Scans all deposit addresses and sweeps any with balance
 */
async function sweepAllDepositAddresses(): Promise<void> {
  try {
    logger.info('Starting hot wallet sweep...');

    const users = await User.findAll({
      attributes: ['depositAddress'],
    });

    logger.info(`Scanning ${users.length} deposit addresses`);

    await Promise.all(users.map((user) => sweepDepositAddress(user.depositAddress)));

    logger.info('Hot wallet sweep completed');
  } catch (error) {
    logger.error('Error during hot wallet sweep', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Starts the hot wallet sweeper service
 */
export function startHotWalletSweeper(socketIO?: SocketIOServer): void {
  logger.info('Starting hot wallet sweeper service...');

  // Store Socket.IO reference
  if (socketIO) {
    io = socketIO;
    logger.info('Socket.IO server attached to hot wallet sweeper');
  }

  sweepAllDepositAddresses();

  setInterval(() => {
    sweepAllDepositAddresses();
  }, SWEEP_INTERVAL);

  logger.info(`Hot wallet sweeper scheduled to run every ${SWEEP_INTERVAL / 1000 / 60} minutes`);
}
