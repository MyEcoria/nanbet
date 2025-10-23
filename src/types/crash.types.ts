export interface ServerToClientEvents {
  'game:state': (data: GameStateData) => void;
  'game:starting': (data: GameStartingData) => void;
  'game:started': (data: GameStartedData) => void;
  'game:tick': (data: GameTickData) => void;
  'game:crashed': (data: GameCrashedData) => void;
  'bet:placed': (data: BetPlacedData) => void;
  'bet:cashout': (data: BetCashOutData) => void;
  'bet:error': (data: BetErrorData) => void;
  'balance:update': (data: BalanceUpdateData) => void;
  error: (data: ErrorData) => void;
}

export interface ClientToServerEvents {
  'bet:place': (data: PlaceBetData, callback: (response: BetResponse) => void) => void;
  'bet:cashout': (callback: (response: CashOutResponse) => void) => void;
  'game:getState': (callback: (response: GameStateResponse) => void) => void;
  'game:getHistory': (limit: number, callback: (response: GameHistoryResponse) => void) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  sessionId: string;
}

export interface GameStateData {
  gameId: string;
  gameNumber: number;
  status: 'betting' | 'running' | 'crashed';
  crashPoint?: number;
  serverSeedHash: string;
  currentMultiplier?: number;
  timeElapsed?: number;
  bettingTimeLeft?: number;
  activeBets?: ActiveBet[];
  userBet?: {
    betId: string;
    amount: number;
    currency: string;
  };
}

export interface GameStartingData {
  gameId: string;
  gameNumber: number;
  serverSeedHash: string;
  bettingDuration: number;
}

export interface GameStartedData {
  gameId: string;
  gameNumber: number;
  startTime: number;
}

export interface GameTickData {
  gameId: string;
  currentMultiplier: number;
  timeElapsed: number;
}

export interface GameCrashedData {
  gameId: string;
  gameNumber: number;
  crashPoint: number;
  serverSeed: string;
  serverSeedHash: string;
}

export interface BetPlacedData {
  betId: string;
  userId: string;
  username?: string;
  amount: number;
  currency: string;
}

export interface BetCashOutData {
  betId: string;
  userId: string;
  username?: string;
  cashOutAt: number;
  profit: number;
  currency: string;
}

export interface BetErrorData {
  message: string;
  code: string;
}

export interface BalanceUpdateData {
  balanceXNO: number;
  balanceBAN: number;
  balanceXRO: number;
  balanceANA: number;
  balanceXDG: number;
  balanceNANUSD: number;
}

export interface ErrorData {
  message: string;
  code?: string;
}

export interface PlaceBetData {
  amount: number;
  currency: string;
}

export interface BetResponse {
  success: boolean;
  betId?: string;
  error?: string;
  code?: string;
}

export interface CashOutResponse {
  success: boolean;
  profit?: number;
  cashOutAt?: number;
  error?: string;
  code?: string;
}

export interface GameStateResponse {
  success: boolean;
  state?: GameStateData;
  error?: string;
}

export interface GameHistoryResponse {
  success: boolean;
  games?: GameHistoryItem[];
  error?: string;
}

export interface GameHistoryItem {
  gameNumber: number;
  crashPoint: number;
  serverSeedHash: string;
  crashedAt: Date;
}

export interface ActiveBet {
  userId: string;
  username?: string;
  amount: number;
  currency: string;
  status: 'pending' | 'playing' | 'cashed_out';
  cashOutAt?: number;
}

export interface CrashGameConfig {
  bettingDuration: number;
  minBet: number;
  maxBet: number;
  maxProfit: number;
  tickRate: number;
  minCrashPoint: number;
  maxCrashPoint: number;
  houseEdge: number;
}

export interface RateLimitConfig {
  betPlaceLimit: number;
  cashOutLimit: number;
  windowMs: number;
}
