import 'dotenv/config';
import crypto from 'node:crypto';
import type {
  NanswapWalletRequest,
  NanswapWalletResponse,
  SignedHeaders,
} from '../types/wallet.types';
import { logger } from './logger';

function getEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export async function create_account(): Promise<string> {
  const body: NanswapWalletRequest = {
    action: 'account_create',
    wallet: getEnvVar('NANSWAP_NODES_WALLET_ID'),
  };

  const res = await fetch(getEnvVar('NANSWAP_NODES_WALLET_RPC'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getSignedHeaders(body),
    },
    body: JSON.stringify(body),
  });

  const resData = (await res.json()) as NanswapWalletResponse;

  if (!resData.account) {
    throw new Error('Failed to create account: no account returned');
  }

  return resData.account;
}

export async function sendFeeless(
  ticker: string,
  fromAccount: string,
  toAccount: string,
  rawAmount: string
): Promise<string | undefined> {
  logger.info(`Sending ${ticker}`, { from: fromAccount, to: toAccount, amount: rawAmount });

  const body: NanswapWalletRequest = {
    action: 'send',
    wallet: getEnvVar('NANSWAP_NODES_WALLET_ID'),
    source: fromAccount,
    destination: toAccount,
    amount: rawAmount,
    ticker: ticker,
  };

  const res = await fetch(getEnvVar('NANSWAP_NODES_WALLET_RPC'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getSignedHeaders(body),
    },
    body: JSON.stringify(body),
  });

  const resData = (await res.json()) as NanswapWalletResponse;

  if (resData.block) {
    logger.info(`${ticker} sent successfully`, { block: resData.block });
  } else {
    logger.error(`${ticker} send failed`, { error: resData.error || 'Unknown error' });
  }

  return resData.block;
}

function getSignedHeaders(message: NanswapWalletRequest): SignedHeaders {
  const messageToSign = {
    ticker: 'ALL',
    params: message,
    ts: Date.now().toString(),
  };

  const signature = crypto
    .createHmac('sha256', getEnvVar('NANSWAP_NODES_WALLET_SECRET_KEY'))
    .update(JSON.stringify(messageToSign))
    .digest('hex');

  const headers: SignedHeaders = {
    'nodes-api-key': getEnvVar('NANSWAP_NODES_WALLET_API_KEY'),
    signature: signature,
    ts: messageToSign.ts,
  };

  return headers;
}
