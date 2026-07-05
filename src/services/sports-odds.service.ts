import ReconnectingWebSocket from 'reconnecting-websocket';
import { Op } from 'sequelize';
import type { Server as SocketIOServer } from 'socket.io';
import WS from 'ws';
import { SportsMatch } from '../models/SportsMatch.model';
import type { SportsOutcome } from '../types/sports.types';
import { logger } from '../utils/logger';
import { probabilityToOdds } from '../utils/odds';

const CLOB_WS_URL =
  process.env.POLYMARKET_CLOB_WS_URL || 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const DB_WRITE_THROTTLE_MS = 2000;
const MAX_SPREAD_FOR_MIDPOINT = 0.1;

interface TokenRoute {
  matchId: string;
  outcome: SportsOutcome;
}

interface MatchOdds {
  home: number;
  draw: number;
  away: number;
}

class SportsOddsService {
  private io: SocketIOServer | null = null;
  private ws: ReconnectingWebSocket | null = null;
  private tokenRoutes: Map<string, TokenRoute> = new Map();
  private currentOdds: Map<string, MatchOdds> = new Map();
  private lastTradePrice: Map<string, number> = new Map();
  private lastDbWrite: Map<string, number> = new Map();

  public start(io: SocketIOServer): void {
    this.io = io;
    this.connect();
  }

  public stop(): void {
    this.ws?.close();
  }

  private connect(): void {
    this.ws = new ReconnectingWebSocket(CLOB_WS_URL, [], {
      WebSocket: WS,
      connectionTimeout: 10000,
      maxRetries: Infinity,
      maxReconnectionDelay: 15000,
      minReconnectionDelay: 1000,
    });

    this.ws.binaryType = 'nodebuffer';

    this.ws.addEventListener('open', () => {
      logger.info('[SportsOdds] CLOB WebSocket connected');
      this.syncSubscriptions().catch((error) => {
        logger.error('[SportsOdds] Error resubscribing after connect', { error });
      });
    });

    this.ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        const messages = Array.isArray(data) ? data : [data];
        for (const message of messages) {
          this.handleMessage(message);
        }
      } catch {
        // Heartbeat/non-JSON frames are expected and ignored.
      }
    });

    this.ws.addEventListener('error', (error) => {
      logger.error('[SportsOdds] CLOB WebSocket error', { error });
    });

    this.ws.addEventListener('close', (event) => {
      logger.warn('[SportsOdds] CLOB WebSocket closed', { code: event.code });
    });
  }

  // biome-ignore lint/suspicious/noExplicitAny: shape varies by event_type, narrowed per-branch below
  private handleMessage(message: any): void {
    if (message.event_type === 'book') {
      const best = this.bestFromBook(message.bids, message.asks);
      if (best) this.updateOdds(message.asset_id, best);
    } else if (message.event_type === 'price_change' && Array.isArray(message.price_changes)) {
      for (const change of message.price_changes) {
        const best = this.bestFromBidAsk(change.best_bid, change.best_ask);
        if (best) this.updateOdds(change.asset_id, best);
      }
    } else if (message.event_type === 'best_bid_ask') {
      const best = this.bestFromBidAsk(message.best_bid, message.best_ask);
      if (best) this.updateOdds(message.asset_id, best);
    } else if (message.event_type === 'last_trade_price') {
      const price = parseFloat(message.price);
      if (!Number.isNaN(price)) {
        this.lastTradePrice.set(message.asset_id, price);
        this.updateOdds(message.asset_id, price);
      }
    }
  }

  private bestFromBook(
    bids: Array<{ price: string }>,
    asks: Array<{ price: string }>
  ): number | null {
    if (!bids?.length || !asks?.length) return null;
    const bestBid = Math.max(...bids.map((b) => parseFloat(b.price)));
    const bestAsk = Math.min(...asks.map((a) => parseFloat(a.price)));
    return this.bestFromBidAsk(String(bestBid), String(bestAsk));
  }

  private bestFromBidAsk(bestBidRaw?: string, bestAskRaw?: string): number | null {
    const bid = parseFloat(bestBidRaw ?? '');
    const ask = parseFloat(bestAskRaw ?? '');
    if (Number.isNaN(bid) || Number.isNaN(ask)) return null;

    const spread = ask - bid;
    if (spread <= MAX_SPREAD_FOR_MIDPOINT) {
      return (bid + ask) / 2;
    }
    return null;
  }

  private updateOdds(tokenId: string, probability: number): void {
    const route = this.tokenRoutes.get(tokenId);
    if (!route) return;

    const odds = probabilityToOdds(probability);
    const current = this.currentOdds.get(route.matchId) ?? { home: 2, draw: 3, away: 2 };
    current[route.outcome] = odds;
    this.currentOdds.set(route.matchId, current);

    this.io?.emit('sports:odds', {
      matchId: route.matchId,
      homeOdds: current.home,
      drawOdds: current.draw,
      awayOdds: current.away,
    });

    this.persistThrottled(route.matchId, current);
  }

  private persistThrottled(matchId: string, odds: MatchOdds): void {
    const last = this.lastDbWrite.get(matchId) ?? 0;
    if (Date.now() - last < DB_WRITE_THROTTLE_MS) return;

    this.lastDbWrite.set(matchId, Date.now());
    SportsMatch.update(
      { homeOdds: odds.home, drawOdds: odds.draw, awayOdds: odds.away },
      { where: { id: matchId } }
    ).catch((error) => {
      logger.error('[SportsOdds] Failed to persist odds', { error, matchId });
    });
  }

  public async syncSubscriptions(): Promise<void> {
    const matches = await SportsMatch.findAll({
      where: { status: { [Op.in]: ['scheduled', 'live'] } },
    });

    this.tokenRoutes.clear();
    const assetIds: string[] = [];

    for (const match of matches) {
      this.tokenRoutes.set(match.homeTokenId, { matchId: match.id, outcome: 'home' });
      this.tokenRoutes.set(match.drawTokenId, { matchId: match.id, outcome: 'draw' });
      this.tokenRoutes.set(match.awayTokenId, { matchId: match.id, outcome: 'away' });
      assetIds.push(match.homeTokenId, match.drawTokenId, match.awayTokenId);

      if (!this.currentOdds.has(match.id)) {
        this.currentOdds.set(match.id, {
          home: parseFloat(String(match.homeOdds)),
          draw: parseFloat(String(match.drawOdds)),
          away: parseFloat(String(match.awayOdds)),
        });
      }
    }

    if (assetIds.length === 0 || !this.ws || this.ws.readyState !== this.ws.OPEN) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: 'market',
        assets_ids: assetIds,
        initial_dump: true,
      })
    );

    logger.info('[SportsOdds] Subscribed to CLOB market channel', {
      matchCount: matches.length,
      tokenCount: assetIds.length,
    });
  }
}

export const polymarketOddsService = new SportsOddsService();
