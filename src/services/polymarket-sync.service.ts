import { Op } from 'sequelize';
import { SportsMatch } from '../models/SportsMatch.model';
import { logger } from '../utils/logger';
import { probabilityToOdds } from '../utils/odds';
import { sportsService } from './sports.service';
import { polymarketOddsService } from './sports-odds.service';

const GAMMA_API_URL = process.env.POLYMARKET_GAMMA_API_URL || 'https://gamma-api.polymarket.com';
const WORLD_CUP_TAG_SLUG = process.env.POLYMARKET_WORLD_CUP_TAG_SLUG || 'fifa-world-cup';

const MATCH_LIST_INTERVAL_MS = 60_000;
const RESOLUTION_CHECK_INTERVAL_MS = 30_000;

interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  groupItemTitle?: string;
  outcomes: string | string[];
  outcomePrices: string | string[];
  clobTokenIds: string | string[];
  closed: boolean;
  active: boolean;
}

interface GammaTeam {
  name: string;
  logo: string;
  ordering: 'home' | 'away';
}

interface GammaEvent {
  id: string;
  slug: string;
  title: string;
  // `startDate`/`endDate` mark when the market itself opened/closes for trading,
  // not kickoff - the actual game time is this top-level `startTime` field.
  startDate: string;
  startTime: string;
  closed: boolean;
  active: boolean;
  markets: GammaMarket[];
  teams?: GammaTeam[];
}

// Gamma API encodes these list fields as JSON-stringified arrays rather than native arrays.
function parseJsonArrayField(value: string | string[]): string[] {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getYesPriceAndToken(market: GammaMarket): { price: number; tokenId: string } | null {
  const outcomes = parseJsonArrayField(market.outcomes);
  const prices = parseJsonArrayField(market.outcomePrices);
  const tokenIds = parseJsonArrayField(market.clobTokenIds);

  const yesIndex = outcomes.findIndex((o) => o.toLowerCase() === 'yes');
  if (yesIndex === -1 || !prices[yesIndex] || !tokenIds[yesIndex]) return null;

  return { price: parseFloat(prices[yesIndex]), tokenId: tokenIds[yesIndex] };
}

/**
 * World Cup matches are modelled on Polymarket as one event containing 3 binary
 * (Yes/No) sub-markets - one per outcome (home win / draw / away win), each
 * distinguished by `groupItemTitle`. This heuristic isolates that shape from the
 * tournament-wide prop markets (e.g. "will Spain win the World Cup") that share
 * the same tag. Confirm/adjust against the live API if match events aren't found.
 */
function identifyMatchEvent(event: GammaEvent): { homeTeam: string; awayTeam: string } | null {
  if (event.markets.length !== 3) return null;

  // Full-time match-winner events are titled exactly "Team A vs. Team B" - variant
  // markets for the same fixture (halftime, exact score, props, ...) append a suffix
  // after a dash, so require the whole title to be just the two team names.
  const vsMatch = event.title.match(/^(.+?)\s+(?:vs\.?|v\.?)\s+(.+)$/i);
  if (!vsMatch || event.title.includes(' - ')) return null;

  return { homeTeam: vsMatch[1].trim(), awayTeam: vsMatch[2].trim() };
}

function classifyOutcomeMarkets(
  markets: GammaMarket[],
  homeTeam: string,
  awayTeam: string
): { home: GammaMarket; draw: GammaMarket; away: GammaMarket } | null {
  let home: GammaMarket | undefined;
  let draw: GammaMarket | undefined;
  let away: GammaMarket | undefined;

  for (const market of markets) {
    const label = (market.groupItemTitle || '').trim().toLowerCase();
    if (!label) continue;

    if (label.startsWith('draw') || label.startsWith('tie')) {
      draw = market;
    } else if (homeTeam.toLowerCase().includes(label) || label.includes(homeTeam.toLowerCase())) {
      home = market;
    } else if (awayTeam.toLowerCase().includes(label) || label.includes(awayTeam.toLowerCase())) {
      away = market;
    }
  }

  if (!home || !draw || !away) return null;
  return { home, draw, away };
}

function getTeamFlags(event: GammaEvent): { homeFlag: string; awayFlag: string } {
  const home = event.teams?.find((t) => t.ordering === 'home');
  const away = event.teams?.find((t) => t.ordering === 'away');
  return { homeFlag: home?.logo ?? '', awayFlag: away?.logo ?? '' };
}

class PolymarketSyncService {
  private matchListTimer: NodeJS.Timeout | null = null;
  private resolutionTimer: NodeJS.Timeout | null = null;

  public start(): void {
    logger.info('[PolymarketSync] Starting sync service');

    this.fetchAndUpsertMatches().catch((error) => {
      logger.error('[PolymarketSync] Initial match sync failed', { error });
    });

    this.matchListTimer = setInterval(() => {
      this.fetchAndUpsertMatches().catch((error) => {
        logger.error('[PolymarketSync] Match sync failed', { error });
      });
    }, MATCH_LIST_INTERVAL_MS);

    this.resolutionTimer = setInterval(() => {
      this.checkResolutions().catch((error) => {
        logger.error('[PolymarketSync] Resolution check failed', { error });
      });
    }, RESOLUTION_CHECK_INTERVAL_MS);
  }

  public stop(): void {
    if (this.matchListTimer) clearInterval(this.matchListTimer);
    if (this.resolutionTimer) clearInterval(this.resolutionTimer);
  }

  public async fetchAndUpsertMatches(): Promise<void> {
    const events = await this.fetchEvents({ closed: false });

    for (const event of events) {
      const teams = identifyMatchEvent(event);
      if (!teams) continue;

      const classified = classifyOutcomeMarkets(event.markets, teams.homeTeam, teams.awayTeam);
      if (!classified) continue;

      const home = getYesPriceAndToken(classified.home);
      const draw = getYesPriceAndToken(classified.draw);
      const away = getYesPriceAndToken(classified.away);
      if (!home || !draw || !away) continue;

      const existing = await SportsMatch.findOne({ where: { polymarketEventId: event.id } });
      const { homeFlag, awayFlag } = getTeamFlags(event);
      const kickoff = new Date(event.startTime);

      const attrs = {
        slug: event.slug,
        homeTeam: teams.homeTeam,
        awayTeam: teams.awayTeam,
        homeFlag,
        awayFlag,
        startTime: kickoff,
        homeTokenId: home.tokenId,
        drawTokenId: draw.tokenId,
        awayTokenId: away.tokenId,
        homeOdds: probabilityToOdds(home.price),
        drawOdds: probabilityToOdds(draw.price),
        awayOdds: probabilityToOdds(away.price),
        lastSyncedAt: new Date(),
      };

      if (existing) {
        // Self-heal matches wrongly flipped to "live" by the earlier startTime bug
        // (it used the market's creation date instead of actual kickoff time).
        const statusFix =
          existing.status === 'live' && kickoff > new Date()
            ? { status: 'scheduled' as const }
            : {};
        await existing.update({ ...attrs, ...statusFix });
      } else {
        await SportsMatch.create({
          polymarketEventId: event.id,
          status: 'scheduled',
          ...attrs,
        });
        logger.info('[PolymarketSync] New match tracked', {
          eventId: event.id,
          homeTeam: teams.homeTeam,
          awayTeam: teams.awayTeam,
        });
      }
    }

    await polymarketOddsService.syncSubscriptions();
  }

  public async checkResolutions(): Promise<void> {
    const pendingMatches = await SportsMatch.findAll({
      where: {
        status: { [Op.in]: ['scheduled', 'live'] },
        startTime: { [Op.lt]: new Date() },
      },
    });

    for (const match of pendingMatches) {
      try {
        const events = await this.fetchEvents({ id: match.polymarketEventId });
        const event = events[0];
        if (!event) continue;

        if (!event.closed) {
          if (match.status === 'scheduled') {
            await match.update({ status: 'live' });
          }
          continue;
        }

        const classified = classifyOutcomeMarkets(event.markets, match.homeTeam, match.awayTeam);
        if (!classified) continue;

        const home = getYesPriceAndToken(classified.home);
        const draw = getYesPriceAndToken(classified.draw);
        const away = getYesPriceAndToken(classified.away);
        if (!home || !draw || !away) continue;

        const outcomes: Array<{ key: 'home' | 'draw' | 'away'; price: number }> = [
          { key: 'home', price: home.price },
          { key: 'draw', price: draw.price },
          { key: 'away', price: away.price },
        ];
        const winner = outcomes.reduce((a, b) => (b.price > a.price ? b : a));

        await match.update({
          status: 'finished',
          winningOutcome: winner.key,
          resolvedAt: new Date(),
        });

        logger.info('[PolymarketSync] Match resolved', {
          matchId: match.id,
          winningOutcome: winner.key,
        });

        await sportsService.settleMatch(match.id, winner.key);
        await polymarketOddsService.syncSubscriptions();
      } catch (error) {
        logger.error('[PolymarketSync] Error resolving match', { error, matchId: match.id });
      }
    }
  }

  // The Gamma API silently caps each response at 100 events regardless of the
  // requested `limit`, so listing everything under a tag requires paging via `offset`.
  private async fetchEvents(params: Record<string, string | boolean>): Promise<GammaEvent[]> {
    const pageSize = 100;
    const maxPages = 20;
    const allEvents: GammaEvent[] = [];

    for (let page = 0; page < maxPages; page++) {
      const query = new URLSearchParams({
        tag_slug: WORLD_CUP_TAG_SLUG,
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      for (const [key, value] of Object.entries(params)) {
        query.set(key, String(value));
      }

      const response = await fetch(`${GAMMA_API_URL}/events?${query.toString()}`);
      if (!response.ok) {
        throw new Error(`Gamma API request failed (${response.status})`);
      }

      const data = (await response.json()) as GammaEvent[] | { events?: GammaEvent[] };
      const events = Array.isArray(data) ? data : (data.events ?? []);
      allEvents.push(...events);

      if (events.length < pageSize) break;
    }

    return allEvents;
  }
}

export const polymarketSyncService = new PolymarketSyncService();
