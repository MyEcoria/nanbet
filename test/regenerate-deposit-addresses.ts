/**
 * Security incident response: rotates every user's depositAddress.
 *
 * Any balance still sitting on the OLD address is swept (credited to the
 * user's balance and forwarded to the hot wallet) before the address is
 * abandoned, so nothing gets stranded.
 *
 * Usage:
 *   bun run test/regenerate-deposit-addresses.ts             # dry run (no writes, no sweep)
 *   bun run test/regenerate-deposit-addresses.ts --execute    # sweeps old addresses and writes new ones
 *
 * After running with --execute, restart the server: websocketService
 * re-subscribes every user's current depositAddress on startup, so the new
 * addresses will pick up monitoring automatically.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { sequelize, User } from '../src/config/database';
import { sweepDepositAddress } from '../src/services/hot-wallet-sweeper.service';
import { logger } from '../src/utils/logger';
import { create_account } from '../src/utils/nanswap_wallet';

const EXECUTE = process.argv.includes('--execute');
const DELAY_MS = 500;

interface RotationResult {
  userId: string;
  oldAddress: string;
  newAddress: string | null;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  await sequelize.authenticate();
  logger.info(`Connected to database (${EXECUTE ? 'EXECUTE' : 'DRY RUN'} mode)`);

  const users = await User.findAll({ attributes: ['id', 'depositAddress'] });
  logger.info(`Found ${users.length} users to rotate`);

  const results: RotationResult[] = [];

  for (const [index, user] of users.entries()) {
    const oldAddress = user.depositAddress;

    try {
      if (EXECUTE) {
        await sweepDepositAddress(oldAddress);
      }

      const newAddress = await create_account();

      if (EXECUTE) {
        await user.update({ depositAddress: newAddress });
      }

      results.push({ userId: user.id, oldAddress, newAddress });
      logger.info(`[${index + 1}/${users.length}] rotated`, { userId: user.id, oldAddress, newAddress });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ userId: user.id, oldAddress, newAddress: null, error: message });
      logger.error(`[${index + 1}/${users.length}] FAILED`, { userId: user.id, oldAddress, error: message });
    }

    await sleep(DELAY_MS);
  }

  const failed = results.filter((r) => r.error);

  const auditFile = path.join(
    __dirname,
    `deposit-address-rotation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  writeFileSync(auditFile, JSON.stringify(results, null, 2));

  logger.info('Deposit address rotation complete', {
    mode: EXECUTE ? 'EXECUTE' : 'DRY RUN',
    total: results.length,
    succeeded: results.length - failed.length,
    failed: failed.length,
    auditFile,
  });

  if (!EXECUTE) {
    logger.info('Dry run only: no balances were swept and no addresses were written. Re-run with --execute to apply.');
  } else if (failed.length > 0) {
    logger.error(`${failed.length} user(s) failed to rotate — check ${auditFile} and re-run for those users.`);
  }

  await sequelize.close();
}

main().catch((error) => {
  logger.error('Fatal error during deposit address rotation', { error });
  process.exit(1);
});
