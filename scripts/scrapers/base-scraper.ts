/**
 * Base scraper interface for racing form data
 */

export interface RunnerData {
  name: string;
  jockey?: string;
  trainer?: string;
  barrier?: number | string;
  weight?: number | string;
  odds?: number;
  form?: string;
  rating?: number;
  source: string; // which scraper provided this
}

export interface RaceDataScraped {
  track: string;
  raceNum: number;
  raceName: string;
  raceTime?: string;
  runners: RunnerData[];
  scrapedAt: Date;
}

export abstract class BaseScraper {
  abstract source: string;

  protected async normalizeHorseName(name: string): Promise<string> {
    return name
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .replace(/\s*\([A-Z]{2,3}\)\s*$/, '') // Remove country codes like (IRE), (GB)
      .trim();
  }

  protected async extractNumbers(text: string): Promise<{ [key: string]: number }> {
    const result: { [key: string]: number } = {};
    const oddsMatch = text.match(/\d+\.\d+/);
    if (oddsMatch) result.odds = parseFloat(oddsMatch[0]);

    const barrierMatch = text.match(/(?:barrier|bar|barrier:)?\s*(\d+)/i);
    if (barrierMatch) result.barrier = parseInt(barrierMatch[1]);

    const weightMatch = text.match(/(\d+)kg|weight\s*(\d+)/i);
    if (weightMatch) result.weight = parseInt(weightMatch[1] || weightMatch[2]);

    return result;
  }

  abstract scrapeRace(url: string): Promise<RaceDataScraped | null>;
}
