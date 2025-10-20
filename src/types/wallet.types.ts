import type { Converter } from '../utils/unit_converts';

export interface WalletConfig {
  mainAccountHot: string;
  RPC: string;
  WS: string[];
  converter: Converter;
  name: string;
  decimalsToShow: number;
  prefix: string;
  logo: string;
  explorer: string;
}

export type WalletsConfig = Record<string, WalletConfig>;

export type CryptoTicker = 'XNO' | 'XRO' | 'BAN' | 'XDG' | 'ANA' | 'NANUSD';

export interface NanswapWalletRequest {
  action: string;
  wallet: string;
  source?: string;
  destination?: string;
  amount?: string;
  ticker?: string;
}

export interface NanswapWalletResponse {
  account?: string;
  block?: string;
  error?: string;
}

export interface SignedHeaders {
  'nodes-api-key': string;
  signature: string;
  ts: string;
}
