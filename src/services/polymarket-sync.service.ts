import { Op } from 'sequelize';
import { SportsMatch } from '../models/SportsMatch.model';
import { logger } from '../utils/logger';
import { probabilityToOdds } from '../utils/odds';
import { sportsService } from './sports.service';
import { polymarketOddsService } from './sports-odds.service';

const GAMMA_API_URL = process.env.POLYMARKET_GAMMA_API_URL || 'https://gamma-api.polymarket.com';

// Each sport is fetched from one or more Polymarket tags. Verified live against
// the Gamma API: `soccer` covers league + World Cup fixtures, `tennis` covers
// ATP/WTA/ITF matches, `basketball` covers NBA/NCAA/international, `baseball`
// covers MLB/KBO. Override via env if a tag turns out to be wrong/renamed.
const SPORTS_CONFIG: { sport: string; tagSlugs: string[] }[] = [
  {
    sport: 'football',
    tagSlugs: (process.env.POLYMARKET_FOOTBALL_TAG_SLUGS || 'soccer,fifa-world-cup').split(','),
  },
  {
    sport: 'tennis',
    tagSlugs: (process.env.POLYMARKET_TENNIS_TAG_SLUGS || 'tennis').split(','),
  },
  {
    sport: 'basketball',
    tagSlugs: (process.env.POLYMARKET_BASKETBALL_TAG_SLUGS || 'basketball').split(','),
  },
  {
    sport: 'baseball',
    tagSlugs: (process.env.POLYMARKET_BASEBALL_TAG_SLUGS || 'baseball').split(','),
  },
];

const MATCH_LIST_INTERVAL_MS = 60_000;
const RESOLUTION_CHECK_INTERVAL_MS = 30_000;
// A hung request (no response, no error) would otherwise stall the whole sync
// loop forever - fetch() has no default timeout.
const FETCH_TIMEOUT_MS = 15_000;
// Matches below this Polymarket liquidity (USD) never get tracked as new
// bettable matches - keep in sync with sportsService's own display/bet gate.
const MIN_LIQUIDITY_USD = parseFloat(process.env.SPORTS_MIN_LIQUIDITY_USD || '500');
// A scheduled/live match whose kickoff is this many days in the past and still
// hasn't resolved on Polymarket (illiquid market, stalled resolution, ...) is
// cancelled and its pending bets refunded, rather than left bettable forever.
const STALE_UNRESOLVED_DAYS = parseFloat(process.env.SPORTS_STALE_UNRESOLVED_DAYS || '3');
// Each pending match costs one sequential Gamma API request to check. A large
// backlog (e.g. after months of unresolved matches piling up) can take far
// longer to scan than RESOLUTION_CHECK_INTERVAL_MS, causing runs to overlap
// and Gamma requests to queue up and time out. Capping the batch size lets the
// backlog drain gradually instead of compounding into a full outage.
const MAX_RESOLUTIONS_PER_CYCLE = 30;

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
  liquidity?: number;
  markets: GammaMarket[];
  teams?: GammaTeam[];
}

interface OutcomePrice {
  price: number;
  tokenId: string;
}

interface ExtractedMatch {
  homeTeam: string;
  awayTeam: string;
  home: OutcomePrice;
  draw: OutcomePrice | null;
  away: OutcomePrice;
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

function getYesPriceAndToken(market: GammaMarket): OutcomePrice | null {
  const outcomes = parseJsonArrayField(market.outcomes);
  const prices = parseJsonArrayField(market.outcomePrices);
  const tokenIds = parseJsonArrayField(market.clobTokenIds);

  const yesIndex = outcomes.findIndex((o) => o.toLowerCase() === 'yes');
  if (yesIndex === -1 || !prices[yesIndex] || !tokenIds[yesIndex]) return null;

  return { price: parseFloat(prices[yesIndex]), tokenId: tokenIds[yesIndex] };
}

/**
 * Soccer matches are modelled on Polymarket as one event containing 3 binary
 * (Yes/No) sub-markets - one per outcome (home win / draw / away win), each
 * distinguished by `groupItemTitle`. This heuristic isolates that shape from the
 * tournament-wide prop markets (e.g. "will Spain win the World Cup") that share
 * the same tag. Confirm/adjust against the live API if match events aren't found.
 */
function extractThreeOutcomeMatch(event: GammaEvent): ExtractedMatch | null {
  if (event.markets.length !== 3) return null;

  // Full-time match-winner events are titled exactly "Team A vs. Team B" - variant
  // markets for the same fixture (halftime, exact score, props, ...) append a suffix
  // after a dash, so require the whole title to be just the two team names.
  const vsMatch = event.title.match(/^(.+?)\s+(?:vs\.?|v\.?)\s+(.+)$/i);
  if (!vsMatch || event.title.includes(' - ')) return null;

  const homeTeam = vsMatch[1].trim();
  const awayTeam = vsMatch[2].trim();

  let home: GammaMarket | undefined;
  let draw: GammaMarket | undefined;
  let away: GammaMarket | undefined;

  for (const market of event.markets) {
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

  const homePrice = getYesPriceAndToken(home);
  const drawPrice = getYesPriceAndToken(draw);
  const awayPrice = getYesPriceAndToken(away);
  if (!homePrice || !drawPrice || !awayPrice) return null;

  return { homeTeam, awayTeam, home: homePrice, draw: drawPrice, away: awayPrice };
}

/**
 * Two-outcome sports (tennis, basketball, baseball, ...) model the match winner
 * as a single market with two outcomes (team/player names), rather than separate
 * Yes/No sub-markets. That moneyline market is reliably the one with no
 * `groupItemTitle` - every prop/spread/totals sub-market on the same event has one
 * (e.g. "Set 1 Winner", "Match O/U 21.5"), the overall match winner doesn't.
 */
function extractTwoOutcomeMatch(event: GammaEvent): ExtractedMatch | null {
  // Requires a real "Player/Team A vs Player/Team B" title, same as the soccer
  // path - otherwise generic binary Yes/No prop markets on the same tag (e.g.
  // "will Ronaldo join a new club?") get misread as a fixture between two teams
  // literally named "Yes" and "No".
  if (!/^(.+?)\s+(?:vs\.?|v\.?)\s+(.+)$/i.test(event.title) || event.title.includes(' - ')) {
    return null;
  }

  const moneyline = event.markets.find((m) => !(m.groupItemTitle || '').trim());
  if (!moneyline) return null;

  const outcomes = parseJsonArrayField(moneyline.outcomes);
  const prices = parseJsonArrayField(moneyline.outcomePrices);
  const tokenIds = parseJsonArrayField(moneyline.clobTokenIds);

  if (outcomes.length !== 2 || prices.length !== 2 || tokenIds.length !== 2) return null;
  if (!outcomes[0] || !outcomes[1] || !prices[0] || !prices[1] || !tokenIds[0] || !tokenIds[1]) {
    return null;
  }
  if (outcomes[0].toLowerCase() === 'yes' && outcomes[1].toLowerCase() === 'no') return null;

  return {
    homeTeam: outcomes[0],
    awayTeam: outcomes[1],
    home: { price: parseFloat(prices[0]), tokenId: tokenIds[0] },
    draw: null,
    away: { price: parseFloat(prices[1]), tokenId: tokenIds[1] },
  };
}

function extractMatch(event: GammaEvent): ExtractedMatch | null {
  return extractTwoOutcomeMatch(event) ?? extractThreeOutcomeMatch(event);
}

function getTeamFlags(event: GammaEvent): { homeFlag: string; awayFlag: string } {
  const home = event.teams?.find((t) => t.ordering === 'home');
  const away = event.teams?.find((t) => t.ordering === 'away');
  return { homeFlag: home?.logo ?? '', awayFlag: away?.logo ?? '' };
}

class PolymarketSyncService {
  private matchListTimer: NodeJS.Timeout | null = null;
  private resolutionTimer: NodeJS.Timeout | null = null;
  private isSyncingMatches = false;
  private isCheckingResolutions = false;

  public start(): void {
    logger.info('[PolymarketSync] Starting sync service');

    this.fetchAndUpsertMatches().catch((error) => {
      logger.error('[PolymarketSync] Initial match sync failed', { error });
    });

    this.matchListTimer = setInterval(() => {
      if (this.isSyncingMatches) {
        logger.warn('[PolymarketSync] Skipping match sync tick, previous run still in progress');
        return;
      }
      this.isSyncingMatches = true;
      this.fetchAndUpsertMatches()
        .catch((error) => {
          logger.error('[PolymarketSync] Match sync failed', { error });
        })
        .finally(() => {
          this.isSyncingMatches = false;
        });
    }, MATCH_LIST_INTERVAL_MS);

    this.resolutionTimer = setInterval(() => {
      if (this.isCheckingResolutions) {
        logger.warn(
          '[PolymarketSync] Skipping resolution check tick, previous run still in progress'
        );
        return;
      }
      this.isCheckingResolutions = true;
      this.checkResolutions()
        .catch((error) => {
          logger.error('[PolymarketSync] Resolution check failed', { error });
        })
        .finally(() => {
          this.isCheckingResolutions = false;
        });
    }, RESOLUTION_CHECK_INTERVAL_MS);
  }

  public stop(): void {
    if (this.matchListTimer) clearInterval(this.matchListTimer);
    if (this.resolutionTimer) clearInterval(this.resolutionTimer);
  }

  public async fetchAndUpsertMatches(): Promise<void> {
    for (const { sport, tagSlugs } of SPORTS_CONFIG) {
      const seenEventIds = new Set<string>();

      for (const tagSlug of tagSlugs) {
        try {
          const events = await this.fetchEvents({ closed: false }, tagSlug.trim());
          logger.info('[PolymarketSync] Fetched events for tag', {
            sport,
            tagSlug: tagSlug.trim(),
            eventCount: events.length,
          });

          for (const event of events) {
            if (seenEventIds.has(event.id)) continue;
            seenEventIds.add(event.id);

            const match = extractMatch(event);
            if (!match) continue;

            const existing = await SportsMatch.findOne({ where: { polymarketEventId: event.id } });
            const liquidity = event.liquidity ?? 0;

            // Don't start tracking new markets that are already too illiquid to
            // offer real odds on; matches already tracked keep syncing (their
            // liquidity is still refreshed below) so they can drop out of the
            // bettable list via sportsService's own liquidity gate.
            if (!existing && liquidity < MIN_LIQUIDITY_USD) continue;

            const { homeFlag, awayFlag } = getTeamFlags(event);
            const kickoff = new Date(event.startTime);

            const attrs = {
              slug: event.slug,
              sport,
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              homeFlag,
              awayFlag,
              startTime: kickoff,
              homeTokenId: match.home.tokenId,
              drawTokenId: match.draw?.tokenId ?? null,
              awayTokenId: match.away.tokenId,
              homeOdds: probabilityToOdds(match.home.price),
              drawOdds: match.draw ? probabilityToOdds(match.draw.price) : null,
              awayOdds: probabilityToOdds(match.away.price),
              liquidity,
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
                sport,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
              });
            }
          }
        } catch (error) {
          logger.error('[PolymarketSync] Failed to sync tag, continuing with remaining tags', {
            error: error instanceof Error ? error.message : String(error),
            sport,
            tagSlug: tagSlug.trim(),
          });
        }
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
      // Oldest kickoffs first: those are the ones most likely to be stale and
      // eligible for cancellation, so prioritize draining them off the backlog.
      order: [['startTime', 'ASC']],
      limit: MAX_RESOLUTIONS_PER_CYCLE,
    });

    for (const match of pendingMatches) {
      try {
        const daysSinceStart = (Date.now() - match.startTime.getTime()) / 86_400_000;

        const events = await this.fetchEventsById(match.polymarketEventId);
        const event = events[0];

        if (!event) {
          if (daysSinceStart > STALE_UNRESOLVED_DAYS) {
            await this.cancelStaleMatch(match, 'event_not_found');
          }
          continue;
        }

        if (event.liquidity !== undefined && event.liquidity !== parseFloat(String(match.liquidity))) {
          await match.update({ liquidity: event.liquidity });
        }

        if (!event.closed) {
          if (match.status === 'scheduled') {
            await match.update({ status: 'live' });
          }
          if (daysSinceStart > STALE_UNRESOLVED_DAYS) {
            await this.cancelStaleMatch(match, 'unresolved_past_deadline');
          }
          continue;
        }

        const extracted =
          match.drawTokenId === null
            ? extractTwoOutcomeMatch(event)
            : extractThreeOutcomeMatch(event);
        if (!extracted) continue;

        const outcomes: Array<{ key: 'home' | 'draw' | 'away'; price: number }> = [
          { key: 'home', price: extracted.home.price },
          { key: 'away', price: extracted.away.price },
        ];
        if (extracted.draw) {
          outcomes.push({ key: 'draw', price: extracted.draw.price });
        }
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

  private async cancelStaleMatch(match: SportsMatch, reason: string): Promise<void> {
    await match.update({ status: 'cancelled', resolvedAt: new Date() });
    await sportsService.voidMatch(match.id);
    await polymarketOddsService.syncSubscriptions();

    logger.warn('[PolymarketSync] Cancelled stale unresolved match, bets refunded', {
      matchId: match.id,
      reason,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      startTime: match.startTime,
    });
  }

  private async fetchEventsById(eventId: string): Promise<GammaEvent[]> {
    const response = await fetch(`${GAMMA_API_URL}/events?id=${encodeURIComponent(eventId)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Gamma API request failed (${response.status})`);
    }
    const data = (await response.json()) as GammaEvent[] | { events?: GammaEvent[] };
    return Array.isArray(data) ? data : (data.events ?? []);
  }

  // The Gamma API silently caps each response at 100 events regardless of the
  // requested `limit`, so listing everything under a tag requires paging via `offset`.
  private async fetchEvents(
    params: Record<string, string | boolean>,
    tagSlug: string
  ): Promise<GammaEvent[]> {
    const pageSize = 100;
    const maxPages = 20;
    const allEvents: GammaEvent[] = [];

    for (let page = 0; page < maxPages; page++) {
      const query = new URLSearchParams({
        tag_slug: tagSlug,
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      for (const [key, value] of Object.entries(params)) {
        query.set(key, String(value));
      }

      const response = await fetch(`${GAMMA_API_URL}/events?${query.toString()}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
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
