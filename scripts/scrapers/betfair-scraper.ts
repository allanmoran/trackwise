/**
 * Betfair Exchange API client for racing data
 * Fetches Australian horse racing markets with form data
 */

import fetch from 'node-fetch';
import { RunnerData, RaceDataScraped } from './base-scraper';

interface BetfairSession {
  sessionToken: string;
  loginStatus: string;
}

interface MarketCatalogue {
  marketId: string;
  marketName: string;
  marketTime: string;
  runners: Array<{
    selectionId: number;
    runnerName: string;
    metadata?: {
      JOCKEY_NAME?: string;
      TRAINER_NAME?: string;
      OFFICIAL_RATING?: string;
      DAYS_SINCE_LAST_RUN?: string;
      FORM?: string;
    };
  }>;
}

interface MarketBook {
  marketId: string;
  runners: Array<{
    selectionId: number;
    status: string;
    ex?: {
      availableToBack?: Array<{ price: number; size: number }>;
    };
  }>;
}

export class BetfairScraper {
  private appKey: string;
  private username: string;
  private password: string;
  private sessionToken: string | null = null;
  private baseUrl = 'https://api.betfair.com/exchange/betting/json-rpc/v1/';

  constructor(username: string, password: string, appKey: string) {
    this.username = username;
    this.password = password;
    this.appKey = appKey;
  }

  /**
   * Authenticate with Betfair API
   */
  async authenticate(): Promise<boolean> {
    try {
      console.log('[Betfair] Authenticating...');

      const loginUrl = 'https://identitysso-cert.betfair.com/api/certlogin';

      // Note: Betfair certificate login requires client cert - using interactive login instead
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'X-Application': this.appKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(
          this.password
        )}`,
      });

      const data = (await response.json()) as any;

      if (!response.ok) {
        console.error('[Betfair] Auth failed:', response.status, response.statusText);
        console.error('[Betfair] Response:', JSON.stringify(data).slice(0, 200));
        return false;
      }

      this.sessionToken = data.sessionToken;

      if (!this.sessionToken) {
        console.error('[Betfair] No session token in response');
        console.error('[Betfair] Response:', JSON.stringify(data).slice(0, 500));
        return false;
      }

      console.log('[Betfair] ✓ Authenticated');
      return true;
    } catch (err) {
      console.error('[Betfair] Auth error:', err);
      return false;
    }
  }

  /**
   * Make JSON-RPC request to Betfair API
   */
  private async jsonRpc(method: string, params: any): Promise<any> {
    if (!this.sessionToken) {
      throw new Error('Not authenticated');
    }

    const payload = {
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now(),
    };

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'X-Application': this.appKey,
          'X-Authentication': this.sessionToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`[Betfair] API error: ${response.status}`);
        return null;
      }

      const data = (await response.json()) as any;
      if (data.error) {
        console.error('[Betfair] RPC error:', data.error);
        return null;
      }

      return data.result;
    } catch (err) {
      console.error(`[Betfair] Request error:`, err);
      return null;
    }
  }

  /**
   * Fetch Australian racing markets for today
   */
  async fetchAustralianRacingMarkets(): Promise<MarketCatalogue[]> {
    try {
      console.log('[Betfair] Fetching Australian racing markets...');

      // Filter for Australian racing
      const marketFilter = {
        eventTypeIds: ['7'], // 7 = Horse Racing
        marketTypes: ['WIN'],
        marketTime: {
          from: new Date().toISOString(),
          to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        textQuery: 'australia', // Filter to Australian races
      };

      const markets = (await this.jsonRpc('listMarketCatalogue', {
        filter: marketFilter,
        sort: 'FIRST_TO_START',
        maxResults: 50,
        marketProjection: ['RUNNER_METADATA', 'EVENT_TYPE', 'MARKET_TIME', 'MARKET_DESCRIPTION'],
      })) as MarketCatalogue[];

      if (!markets) return [];

      console.log(`[Betfair] Found ${markets.length} Australian racing markets`);
      return markets;
    } catch (err) {
      console.error('[Betfair] Error fetching markets:', err);
      return [];
    }
  }

  /**
   * Fetch odds for a specific market
   */
  async fetchMarketOdds(marketId: string): Promise<MarketBook | null> {
    try {
      const odds = (await this.jsonRpc('listMarketBook', {
        marketIds: [marketId],
        priceProjection: {
          priceData: ['EX_BEST_OFFERS'],
        },
      })) as MarketBook[];

      return odds?.[0] || null;
    } catch (err) {
      console.error('[Betfair] Error fetching odds:', err);
      return null;
    }
  }

  /**
   * Extract race data from Betfair market
   */
  async extractRaceData(market: MarketCatalogue): Promise<RaceDataScraped | null> {
    try {
      // Parse market name to get track and race number
      // Format: "2:30 Hawkesbury" or similar
      const marketName = market.marketName || '';
      const timeMatch = marketName.match(/(\d+):(\d+)\s+(.+)/);

      if (!timeMatch) {
        console.log(`[Betfair] ⚠ Could not parse market name: ${marketName}`);
        return null;
      }

      const raceTime = `${timeMatch[1]}:${timeMatch[2]}`;
      const track = timeMatch[3].toUpperCase().trim();

      // Extract race number (often from event ID or market metadata)
      // For now, use market ID as a proxy
      const raceNum = parseInt(market.marketId.split('.')[0]) % 10 || 1;

      // Fetch odds to get current prices
      const oddsData = await this.fetchMarketOdds(market.marketId);

      // Build runner list
      const runners: RunnerData[] = [];
      const oddsMap = new Map<number, number>();

      if (oddsData?.runners) {
        for (const runner of oddsData.runners) {
          if (runner.ex?.availableToBack && runner.ex.availableToBack.length > 0) {
            const bestOdds = runner.ex.availableToBack[0].price;
            oddsMap.set(runner.selectionId, bestOdds);
          }
        }
      }

      // Add runners with metadata
      for (const runner of market.runners || []) {
        const odds = oddsMap.get(runner.selectionId);

        if (odds && odds > 1 && odds < 50) {
          runners.push({
            name: runner.runnerName.toUpperCase(),
            jockey: runner.metadata?.JOCKEY_NAME,
            trainer: runner.metadata?.TRAINER_NAME,
            odds,
            form: runner.metadata?.FORM,
            rating: runner.metadata?.OFFICIAL_RATING ? parseInt(runner.metadata.OFFICIAL_RATING) : undefined,
            source: 'Betfair',
          });
        }
      }

      if (runners.length < 3) {
        console.log(`[Betfair] ⚠ Only ${runners.length} runners found`);
        return null;
      }

      return {
        track,
        raceNum,
        raceName: `${track} R${raceNum}`,
        raceTime,
        runners: runners.sort((a, b) => (a.odds || 0) - (b.odds || 0)),
        scrapedAt: new Date(),
      };
    } catch (err) {
      console.error('[Betfair] Error extracting race data:', err);
      return null;
    }
  }

  /**
   * Fetch all Australian races for today
   */
  async fetchAllAustralianRaces(): Promise<RaceDataScraped[]> {
    if (!this.sessionToken) {
      const authenticated = await this.authenticate();
      if (!authenticated) return [];
    }

    const markets = await this.fetchAustralianRacingMarkets();
    const races: RaceDataScraped[] = [];

    for (const market of markets.slice(0, 20)) {
      // Limit to 20 races
      const race = await this.extractRaceData(market);
      if (race) {
        races.push(race);
      }
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    return races;
  }
}
