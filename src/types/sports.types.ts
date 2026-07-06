import type { Optional } from 'sequelize';

export type SportsMatchStatus = 'scheduled' | 'live' | 'finished' | 'cancelled';
export type SportsOutcome = 'home' | 'draw' | 'away';
export type SportsBetStatus = 'pending' | 'won' | 'lost' | 'void';

export interface SportsMatchAttributes {
  id: string;
  polymarketEventId: string;
  slug: string;
  homeTeam: string;
  awayTeam: string;
  homeFlag: string;
  awayFlag: string;
  startTime: Date;
  status: SportsMatchStatus;
  homeTokenId: string;
  drawTokenId: string;
  awayTokenId: string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  winningOutcome: SportsOutcome | null;
  resolvedAt: Date | null;
  lastSyncedAt: Date;
  createdAt: Date;
}

export interface SportsMatchCreationAttributes
  extends Optional<
    SportsMatchAttributes,
    | 'id'
    | 'createdAt'
    | 'status'
    | 'homeOdds'
    | 'drawOdds'
    | 'awayOdds'
    | 'winningOutcome'
    | 'resolvedAt'
    | 'lastSyncedAt'
  > {}

export interface SportsBetAttributes {
  id: string;
  userId: string;
  matchId: string;
  outcome: SportsOutcome;
  currency: string;
  amount: number;
  odds: number;
  potentialPayout: number;
  status: SportsBetStatus;
  placedAt: Date;
  settledAt: Date | null;
}

export interface SportsBetCreationAttributes
  extends Optional<SportsBetAttributes, 'id' | 'status' | 'placedAt' | 'settledAt'> {}

export interface SportsMatchSummary {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeFlag: string;
  awayFlag: string;
  startTime: string;
  status: SportsMatchStatus;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  winningOutcome: SportsOutcome | null;
}

export interface SportsOddsUpdate {
  matchId: string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
}

export interface SportsBetPlacedData {
  betId: string;
  matchId: string;
  outcome: SportsOutcome;
  amount: number;
  currency: string;
  odds: number;
  potentialPayout: number;
}

export interface SportsBetSettledData {
  betId: string;
  matchId: string;
  outcome: SportsOutcome;
  status: 'won' | 'lost';
  amount: number;
  currency: string;
  payout: number;
}

export interface PlaceSportsBetData {
  matchId: string;
  outcome: SportsOutcome;
  amount: number;
  currency: string;
}

export interface SportsBetResponse {
  success: boolean;
  betId?: string;
  potentialPayout?: number;
  odds?: number;
  error?: string;
  code?: string;
}
