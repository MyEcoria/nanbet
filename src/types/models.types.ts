import type { Optional } from 'sequelize';

// User types
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

// LoginHistory types
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
