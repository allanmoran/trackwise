/**
 * Multi-source racing form scraper
 * Tries TAB → Racing.com → Sportsbet with fallback and data merging
 */

import { TabScraper } from './tab-scraper';
import { RacingComScraper } from './racing-com-scraper';
import { SportsbetScraper } from './sportsbet-scraper';
import { RunnerData, RaceDataScraped } from './base-scraper';

interface MergedRunnerData extends RunnerData {
  sources: string[]; // Which sources had this runner
  oddsOptions?: number[]; // Odds from different sources
}

interface MergedRaceData extends RaceDataScraped {
  runners: MergedRunnerData[];
  confidence: number; // 0-1 based on how many sources agree
}

export class MultiSourceScraper {
  private tabScraper: TabScraper;
  private racingComScraper: RacingComScraper;
  private sportsbetScraper: SportsbetScraper;

  constructor() {
    this.tabScraper = new TabScraper();
    this.racingComScraper = new RacingComScraper();
    this.sportsbetScraper = new SportsbetScraper();
  }

  /**
   * Scrape a single race from multiple sources with fallback
   */
  async scrapeRaceMultiSource(
    tabUrl: string,
    racingComUrl: string,
    sportsbetUrl?: string
  ): Promise<MergedRaceData | null> {
    console.log('\n═══ MULTI-SOURCE SCRAPE ═══');

    // Primary: TAB
    let raceData = await this.tabScraper.scrapeRace(tabUrl);

    // Fallback 1: Racing.com
    if (!raceData || raceData.runners.length < 8) {
      console.log('→ TAB incomplete, trying Racing.com...');
      raceData = await this.racingComScraper.scrapeRace(racingComUrl);
    }

    // Fallback 2: Sportsbet
    if ((!raceData || raceData.runners.length < 8) && sportsbetUrl) {
      console.log('→ Racing.com incomplete, trying Sportsbet...');
      raceData = await this.sportsbetScraper.scrapeRace(sportsbetUrl);
    }

    if (!raceData) {
      console.log('✗ All sources failed');
      return null;
    }

    // Try to enhance with additional sources (parallel)
    console.log('→ Enhancing with cross-source data...');
    const racingComData = await this.racingComScraper.scrapeRace(racingComUrl).catch(() => null);
    const sportsbetData = sportsbetUrl ? await this.sportsbetScraper.scrapeRace(sportsbetUrl).catch(() => null) : null;

    // Merge results
    const merged = this.mergeRunnerData(
      raceData.runners,
      racingComData?.runners || [],
      sportsbetData?.runners || []
    );

    return {
      track: raceData.track,
      raceNum: raceData.raceNum,
      raceName: raceData.raceName,
      raceTime: raceData.raceTime,
      runners: merged,
      scrapedAt: new Date(),
      confidence: this.calculateConfidence(merged),
    };
  }

  /**
   * Merge runner data from multiple sources
   */
  private mergeRunnerData(
    primaryRunners: RunnerData[],
    secondaryRunners: RunnerData[] = [],
    tertiaryRunners: RunnerData[] = []
  ): MergedRunnerData[] {
    const mergedMap = new Map<string, MergedRunnerData>();

    // Normalize horse names for matching
    const normalize = (name: string): string =>
      name
        .toUpperCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\s*\([A-Z]{2,3}\)\s*$/g, '');

    // Process primary source
    for (const runner of primaryRunners) {
      const key = normalize(runner.name);
      if (!mergedMap.has(key)) {
        mergedMap.set(key, {
          ...runner,
          sources: [runner.source],
          oddsOptions: runner.odds ? [runner.odds] : [],
        });
      }
    }

    // Process secondary source
    for (const runner of secondaryRunners) {
      const key = normalize(runner.name);
      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key)!;
        existing.sources.push(runner.source);
        if (runner.odds && !existing.oddsOptions?.includes(runner.odds)) {
          existing.oddsOptions?.push(runner.odds);
        }
        // Fill in missing data
        if (!existing.jockey && runner.jockey) existing.jockey = runner.jockey;
        if (!existing.trainer && runner.trainer) existing.trainer = runner.trainer;
        if (!existing.odds && runner.odds) existing.odds = runner.odds;
      } else {
        mergedMap.set(key, {
          ...runner,
          sources: [runner.source],
          oddsOptions: runner.odds ? [runner.odds] : [],
        });
      }
    }

    // Process tertiary source
    for (const runner of tertiaryRunners) {
      const key = normalize(runner.name);
      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key)!;
        if (!existing.sources.includes(runner.source)) {
          existing.sources.push(runner.source);
        }
        if (runner.odds && !existing.oddsOptions?.includes(runner.odds)) {
          existing.oddsOptions?.push(runner.odds);
        }
      } else {
        mergedMap.set(key, {
          ...runner,
          sources: [runner.source],
          oddsOptions: runner.odds ? [runner.odds] : [],
        });
      }
    }

    return Array.from(mergedMap.values())
      .sort((a, b) => (b.sources.length - a.sources.length) || (a.odds || 0) - (b.odds || 0));
  }

  /**
   * Calculate confidence based on cross-source agreement
   */
  private calculateConfidence(runners: MergedRunnerData[]): number {
    if (runners.length === 0) return 0;

    const multiSourceRunners = runners.filter(r => r.sources.length > 1);
    const avgSources = runners.reduce((sum, r) => sum + r.sources.length, 0) / runners.length;

    // Confidence = % of runners with multi-source validation + avg sources/3
    return Math.min(1, (multiSourceRunners.length / runners.length + avgSources / 3) / 2);
  }

  async close() {
    await Promise.all([
      this.tabScraper.close(),
      this.racingComScraper.close(),
      this.sportsbetScraper.close(),
    ]).catch(() => null);
  }
}

// Export for testing
export type { MergedRaceData, MergedRunnerData };
