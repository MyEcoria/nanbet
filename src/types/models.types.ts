import type { Optional } from 'sequelize';

export interface UserAttributes {
  id: string;
  address: string;
  depositAddress: string;
  balanceXNO: number;
  balanceBAN: number;
  balanceXRO: number;
  balanceANA: number;
  balanceXDG: number;
  balanceNANUSD: number;
  createdAt: Date;
}

export interface UserCreationAttributes
  extends Optional<
    UserAttributes,
    | 'id'
    | 'createdAt'
    | 'depositAddress'
    | 'balanceXNO'
    | 'balanceBAN'
    | 'balanceXRO'
    | 'balanceANA'
    | 'balanceXDG'
    | 'balanceNANUSD'
  > {}

export interface LoginHistoryAttributes {
  id: string;
  userId: string | null;
  ipAddress: string;
  createdAt: Date;
  validityHours: number;
  sessionId: string;
  message: string;
  isAuthenticated: boolean;
  authToken: string | null;
  expiresAt: Date;
}

export interface LoginHistoryCreationAttributes
  extends Optional<
    LoginHistoryAttributes,
    'id' | 'createdAt' | 'validityHours' | 'userId' | 'isAuthenticated' | 'authToken'
  > {}

export interface CrashGameAttributes {
  id: string;
  gameNumber: number;
  serverSeed: string;
  serverSeedHash: string;
  crashPoint: number;
  startedAt: Date;
  crashedAt: Date | null;
  status: 'pending' | 'betting' | 'running' | 'crashed';
  createdAt: Date;
}

export interface CrashGameCreationAttributes
  extends Optional<
    CrashGameAttributes,
    'id' | 'createdAt' | 'gameNumber' | 'startedAt' | 'crashedAt' | 'status'
  > {}

export interface CrashBetAttributes {
  id: string;
  userId: string;
  gameId: string;
  currency: string;
  betAmount: number;
  cashOutAt: number | null;
  profit: number;
  status: 'pending' | 'playing' | 'cashed_out' | 'lost';
  createdAt: Date;
  cashOutTime: Date | null;
}

export interface CrashBetCreationAttributes
  extends Optional<
    CrashBetAttributes,
    'id' | 'createdAt' | 'cashOutAt' | 'profit' | 'status' | 'cashOutTime'
  > {}

export interface WithdrawalAttributes {
  id: string;
  userId: string;
  currency: string;
  amount: number;
  destinationAddress: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  transactionHash: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;
}

export interface WithdrawalCreationAttributes
  extends Optional<
    WithdrawalAttributes,
    | 'id'
    | 'createdAt'
    | 'updatedAt'
    | 'status'
    | 'transactionHash'
    | 'failureReason'
    | 'processedAt'
  > {}
