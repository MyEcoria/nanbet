import { Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import wallets from '../config/wallets';
import { User } from '../models/User.model';
import { Withdrawal } from '../models/Withdrawal.model';
import { logger } from '../utils/logger';
import { sendFeeless } from '../utils/nanswap_wallet';

const MINIMUM_WITHDRAWAL_AMOUNTS: Record<string, number> = {
  XNO: 0.000001,
  BAN: 0.00001,
  XRO: 0.00001,
  ANA: 0.00001,
  XDG: 0.00001,
  NANUSD: 0.00001,
};

interface CreateWithdrawalRequest {
  userId: string;
  currency: string;
  amount: number;
  destinationAddress: string;
}

interface WithdrawalResult {
  success: boolean;
  message: string;
  withdrawal?: Withdrawal;
  error?: string;
}

export class WithdrawalService {
  /**
   * Validates the withdrawal address format
   */
  private validateAddress(address: string, currency: string): boolean {
    const walletConfig = wallets[currency];
    if (!walletConfig) {
      return false;
    }

    const prefix = walletConfig.prefix;
    const addressRegex = new RegExp(`^${prefix}_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$`);
    return addressRegex.test(address);
  }

  /**
   * Creates a withdrawal request with transaction locks to prevent double-spend and race conditions
   */
  async createWithdrawal(request: CreateWithdrawalRequest): Promise<WithdrawalResult> {
    const { userId, currency, amount, destinationAddress } = request;

    try {
      // Validate currency
      if (!wallets[currency]) {
        return {
          success: false,
          message: 'Invalid currency',
          error: 'INVALID_CURRENCY',
        };
      }

      // Validate amount
      if (amount <= 0) {
        return {
          success: false,
          message: 'Invalid withdrawal amount',
          error: 'INVALID_AMOUNT',
        };
      }

      // Check minimum withdrawal amount
      const minAmount = MINIMUM_WITHDRAWAL_AMOUNTS[currency] || 0;
      if (amount < minAmount) {
        return {
          success: false,
          message: `Minimum withdrawal amount is ${minAmount} ${currency}`,
          error: 'AMOUNT_TOO_LOW',
        };
      }

      // Validate destination address
      if (!this.validateAddress(destinationAddress, currency)) {
        return {
          success: false,
          message: 'Invalid destination address',
          error: 'INVALID_ADDRESS',
        };
      }

      // Use a transaction with pessimistic locking to prevent race conditions
      const result = await sequelize.transaction(
        {
          isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
        },
        async (t) => {
          // Lock the user row to prevent concurrent withdrawals (SELECT FOR UPDATE)
          const user = await User.findByPk(userId, {
            lock: t.LOCK.UPDATE,
            transaction: t,
          });

          if (!user) {
            throw new Error('USER_NOT_FOUND');
          }

          // Check if user has any pending or processing withdrawals
          const pendingWithdrawals = await Withdrawal.count({
            where: {
              userId,
              status: ['pending', 'processing'],
            },
            transaction: t,
          });

          if (pendingWithdrawals > 0) {
            throw new Error('PENDING_WITHDRAWAL_EXISTS');
          }

          // Get the balance field for the currency
          const balanceField = `balance${currency}` as keyof User;
          const currentBalance = parseFloat(String(user[balanceField] ?? 0));

          // Verify sufficient balance
          if (currentBalance < amount) {
            throw new Error('INSUFFICIENT_BALANCE');
          }

          // Deduct the balance atomically in the same transaction
          const newBalance = currentBalance - amount;
          await user.update({ [balanceField]: newBalance }, { transaction: t });

          // Create the withdrawal record
          const withdrawal = await Withdrawal.create(
            {
              userId,
              currency,
              amount,
              destinationAddress,
              status: 'pending',
            },
            { transaction: t }
          );

          logger.info('Withdrawal created successfully', {
            withdrawalId: withdrawal.id,
            userId,
            currency,
            amount,
            previousBalance: currentBalance,
            newBalance,
          });

          return { user, withdrawal };
        }
      );

      // Process the withdrawal asynchronously (outside the transaction to avoid blocking)
      this.processWithdrawal(result.withdrawal.id).catch((error) => {
        logger.error('Error processing withdrawal asynchronously', { error });
      });

      return {
        success: true,
        message: 'Withdrawal request created successfully',
        withdrawal: result.withdrawal,
      };
    } catch (error) {
      logger.error('Error creating withdrawal', { error, request });

      // Map known errors to user-friendly messages
      if (error instanceof Error) {
        switch (error.message) {
          case 'USER_NOT_FOUND':
            return { success: false, message: 'User not found', error: 'USER_NOT_FOUND' };
          case 'PENDING_WITHDRAWAL_EXISTS':
            return {
              success: false,
              message: 'You already have a pending withdrawal. Please wait for it to complete.',
              error: 'PENDING_WITHDRAWAL_EXISTS',
            };
          case 'INSUFFICIENT_BALANCE':
            return {
              success: false,
              message: 'Insufficient balance',
              error: 'INSUFFICIENT_BALANCE',
            };
        }
      }

      return {
        success: false,
        message: 'Failed to create withdrawal request',
        error: 'UNKNOWN_ERROR',
      };
    }
  }

  /**
   * Process the withdrawal by sending the transaction on the blockchain
   */
  private async processWithdrawal(withdrawalId: string): Promise<void> {
    try {
      // Update status to processing
      const withdrawal = await Withdrawal.findByPk(withdrawalId);

      if (!withdrawal) {
        logger.error('Withdrawal not found', { withdrawalId });
        return;
      }

      if (withdrawal.status !== 'pending') {
        logger.warn('Withdrawal is not in pending status', {
          withdrawalId,
          status: withdrawal.status,
        });
        return;
      }

      await withdrawal.update({ status: 'processing' });

      const walletConfig = wallets[withdrawal.currency];
      if (!walletConfig) {
        throw new Error(`Unknown wallet configuration for ${withdrawal.currency}`);
      }

      // Convert amount to raw format
      const rawAmount = walletConfig.converter.megaToRaw(withdrawal.amount.toString());

      // Send the transaction from hot wallet to destination address
      const transactionHash = await sendFeeless(
        withdrawal.currency,
        walletConfig.mainAccountHot,
        withdrawal.destinationAddress,
        rawAmount
      );

      if (transactionHash) {
        // Transaction successful
        await withdrawal.update({
          status: 'completed',
          transactionHash,
          processedAt: new Date(),
        });

        logger.info('Withdrawal processed successfully', {
          withdrawalId,
          transactionHash,
          currency: withdrawal.currency,
          amount: withdrawal.amount,
        });
      } else {
        // Transaction failed
        throw new Error('Failed to send transaction');
      }
    } catch (error) {
      logger.error('Error processing withdrawal', { error, withdrawalId });

      // Update withdrawal status to failed and refund the balance
      await this.refundWithdrawal(withdrawalId, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Refund a failed withdrawal by crediting back the user's balance
   */
  private async refundWithdrawal(withdrawalId: string, failureReason: string): Promise<void> {
    try {
      await sequelize.transaction(async (t) => {
        const withdrawal = await Withdrawal.findByPk(withdrawalId, {
          lock: t.LOCK.UPDATE,
          transaction: t,
        });

        if (!withdrawal) {
          throw new Error('Withdrawal not found');
        }

        // Only refund if not already completed
        if (withdrawal.status === 'completed') {
          logger.warn('Cannot refund completed withdrawal', { withdrawalId });
          return;
        }

        // Mark withdrawal as failed
        await withdrawal.update(
          {
            status: 'failed',
            failureReason,
            processedAt: new Date(),
          },
          { transaction: t }
        );

        // Refund the user's balance
        const user = await User.findByPk(withdrawal.userId, {
          lock: t.LOCK.UPDATE,
          transaction: t,
        });

        if (!user) {
          throw new Error('User not found for refund');
        }

        const balanceField = `balance${withdrawal.currency}` as keyof User;
        const currentBalance = parseFloat(String(user[balanceField] ?? 0));
        const newBalance = currentBalance + parseFloat(String(withdrawal.amount));

        await user.update({ [balanceField]: newBalance }, { transaction: t });

        logger.info('Withdrawal refunded', {
          withdrawalId,
          userId: withdrawal.userId,
          currency: withdrawal.currency,
          amount: withdrawal.amount,
          previousBalance: currentBalance,
          newBalance,
        });
      });
    } catch (error) {
      logger.error('Error refunding withdrawal', { error, withdrawalId });
    }
  }

  /**
   * Get withdrawal history for a user
   */
  async getUserWithdrawals(userId: string, limit = 20): Promise<Withdrawal[]> {
    try {
      const withdrawals = await Withdrawal.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
        limit,
      });

      return withdrawals;
    } catch (error) {
      logger.error('Error fetching user withdrawals', { error, userId });
      return [];
    }
  }

  /**
   * Get a specific withdrawal by ID
   */
  async getWithdrawalById(withdrawalId: string, userId: string): Promise<Withdrawal | null> {
    try {
      const withdrawal = await Withdrawal.findOne({
        where: {
          id: withdrawalId,
          userId,
        },
      });

      return withdrawal;
    } catch (error) {
      logger.error('Error fetching withdrawal', { error, withdrawalId, userId });
      return null;
    }
  }

}

export const withdrawalService = new WithdrawalService();
