/**
 * Integration layer: converts manually entered races into betting opportunities
 * Bridges manual_races table with paper trading engine
 */

import postgres from 'postgres';

export interface ManualRaceEntry {
  date: string;
  track: string;
  raceNum: number;
  raceTime: string;
  runners: Array<{
    name: string;
    jockey?: string;
    trainer?: string;
    odds: number;
    barrier?: string;
    weight?: string;
  }>;
}

/**
 * Fetch today's manually entered races
 */
export async function getTodaysManualRaces(sql: any): Promise<ManualRaceEntry[]> {
  const today = new Date().toISOString().split('T')[0];

  try {
    const races = await sql`
      SELECT
        date,
        track,
        race_num,
        race_time,
        runners
      FROM manual_races
      WHERE date = ${today}
      ORDER BY race_num
    `;

    return races.map((r: any) => ({
      date: r.date,
      track: r.track,
      raceNum: r.race_num,
      raceTime: r.race_time,
      runners: typeof r.runners === 'string' ? JSON.parse(r.runners) : r.runners,
    }));
  } catch (err) {
    console.error('[ENTRY-INTEGRATION] Error fetching manual races:', err);
    return [];
  }
}

/**
 * Get knowledge base stats for form scoring
 */
export async function getFormKnowledgeBase(sql: any) {
  try {
    // Aggregate form data from historical manual entries
    const data = await sql`
      SELECT
        jsonb_agg(runners) as all_runners,
        count(*) as total_races,
        count(DISTINCT date) as unique_dates
      FROM manual_races
    `;

    const result = data[0];
    const allRunners = result.all_runners || [];

    // Build jockey/trainer win rate stats
    const jockeyStats = new Map<string, { runs: number; odds: number[] }>();
    const trainerStats = new Map<string, { runs: number; odds: number[] }>();

    for (const racesArray of allRunners) {
      if (!Array.isArray(racesArray)) continue;
      for (const runner of racesArray) {
        if (runner.jockey) {
          if (!jockeyStats.has(runner.jockey)) {
            jockeyStats.set(runner.jockey, { runs: 0, odds: [] });
          }
          const stats = jockeyStats.get(runner.jockey)!;
          stats.runs += 1;
          stats.odds.push(runner.odds);
        }

        if (runner.trainer) {
          if (!trainerStats.has(runner.trainer)) {
            trainerStats.set(runner.trainer, { runs: 0, odds: [] });
          }
          const stats = trainerStats.get(runner.trainer)!;
          stats.runs += 1;
          stats.odds.push(runner.odds);
        }
      }
    }

    return {
      totalRaces: result.total_races,
      uniqueDates: result.unique_dates,
      jockeyStats: Object.fromEntries(jockeyStats),
      trainerStats: Object.fromEntries(trainerStats),
    };
  } catch (err) {
    console.error('[ENTRY-INTEGRATION] Error getting form KB:', err);
    return null;
  }
}

/**
 * Score a runner based on knowledge base
 */
export function scoreRunnerFromKB(
  runner: ManualRaceEntry['runners'][0],
  kb: any
): { score: number; reasoning: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Start with baseline 50
  score = 50;

  // Jockey analysis
  if (runner.jockey && kb.jockeyStats[runner.jockey]) {
    const jockeyRuns = kb.jockeyStats[runner.jockey].runs;
    const avgOdds =
      kb.jockeyStats[runner.jockey].odds.reduce((a: number, b: number) => a + b, 0) /
      kb.jockeyStats[runner.jockey].odds.length;

    if (jockeyRuns >= 3 && avgOdds < 4) {
      // Active, backed consistently
      score += 10;
      reasons.push(`Jockey: ${runner.jockey} (${jockeyRuns} runs)`);
    }
  }

  // Trainer analysis
  if (runner.trainer && kb.trainerStats[runner.trainer]) {
    const trainerRuns = kb.trainerStats[runner.trainer].runs;
    const avgOdds =
      kb.trainerStats[runner.trainer].odds.reduce((a: number, b: number) => a + b, 0) /
      kb.trainerStats[runner.trainer].odds.length;

    if (trainerRuns >= 3 && avgOdds < 4) {
      score += 10;
      reasons.push(`Trainer: ${runner.trainer} (${trainerRuns} runs)`);
    }
  }

  // Odds analysis (single digit odds = market confidence)
  if (runner.odds < 3.5) {
    score += 8;
    reasons.push(`Market backed: @$${runner.odds}`);
  } else if (runner.odds >= 3.5 && runner.odds < 6) {
    score += 4;
  }

  // Apply knowledge base confidence multiplier
  const kbConfidence = Math.min(1, kb.totalRaces / 30); // 30 races = full confidence
  score = Math.floor(score * (0.5 + 0.5 * kbConfidence));

  return { score, reasoning: reasons };
}

/**
 * Pick best bets from manual races
 */
export function pickBetsFromManualRaces(
  races: ManualRaceEntry[],
  kb: any,
  maxBets: number = 5
): Array<{
  track: string;
  raceNum: number;
  horse: string;
  odds: number;
  confidence: number;
  reasoning: string[];
}> {
  const candidates: Array<{
    track: string;
    raceNum: number;
    horse: string;
    odds: number;
    confidence: number;
    reasoning: string[];
  }> = [];

  for (const race of races) {
    for (const runner of race.runners) {
      const { score, reasoning } = scoreRunnerFromKB(runner, kb);

      if (score > 60) {
        // Only high confidence picks
        candidates.push({
          track: race.track,
          raceNum: race.raceNum,
          horse: runner.name,
          odds: runner.odds,
          confidence: Math.min(100, score),
          reasoning,
        });
      }
    }
  }

  // Sort by confidence and return top N
  return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, maxBets);
}
