#!/usr/bin/env node
/**
 * Enrich Betfair KB data with jockey/trainer information
 *
 * Workflow:
 * 1. Reads races already imported from Betfair (with horses, results, odds)
 * 2. Accepts jockey/trainer data from CSV file
 * 3. Matches horses across both datasets
 * 4. Re-logs enriched records to KB with complete trainer/jockey info
 *
 * CSV Format expected:
 * date,track,race_num,horse_name,jockey,trainer
 * 2026-04-07,Sale,1,LAUBERHORN,Beau Mertens,Mick Price & Michael Kent Jnr
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import fs from 'node:fs';
import { createReadStream } from 'node:fs';
import readline from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

import postgres from 'postgres';

const sql = postgres({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  database: process.env.DB_NAME ?? 'trackwise',
  username: process.env.DB_USER ?? 'mora',
  password: process.env.DB_PASSWORD ?? 'mora123',
  ssl: process.env.DB_SSL === 'true',
});

interface JockeyTrainerRecord {
  date: string;
  track: string;
  race_num: number;
  horse_name: string;
  jockey: string;
  trainer: string;
}

interface EnrichedRunner {
  horseName: string;
  jockey: string;
  trainer: string;
  result: 'WIN' | 'PLACE' | 'LOSS';
}

interface EnrichedRace {
  date: string;
  track: string;
  raceNum: number;
  runners: EnrichedRunner[];
}

async function parseJockeyTrainerCSV(filePath: string): Promise<Map<string, JockeyTrainerRecord>> {
  const records = new Map<string, JockeyTrainerRecord>();

  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });

    let isFirstLine = true;

    rl.on('line', (line) => {
      if (isFirstLine) {
        isFirstLine = false;
        return; // Skip header
      }

      const [date, track, race_num, horse_name, jockey, trainer] = line.split(',').map(f => f.trim());

      if (date && track && race_num && horse_name && jockey && trainer) {
        const key = `${date}-${track}-${race_num}-${horse_name}`;
        records.set(key, {
          date,
          track,
          race_num: parseInt(race_num),
          horse_name,
          jockey,
          trainer,
        });
      }
    });

    rl.on('close', () => resolve(records));
    rl.on('error', reject);
  });
}

async function getBetfairImportedRaces(): Promise<EnrichedRace[]> {
  // Get all races from manual_races that were imported from Betfair
  // These have "Unknown" jockey/trainer
  const races = await sql<Array<{
    date: string;
    track: string;
    race_num: number;
    runners: string;
  }>>`
    SELECT date, track, race_num, runners
    FROM manual_races
    WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    ORDER BY date, track, race_num
  `;

  const enriched: EnrichedRace[] = [];

  for (const race of races) {
    const runners = typeof race.runners === 'string' ? JSON.parse(race.runners) : race.runners;

    enriched.push({
      date: race.date,
      track: race.track,
      raceNum: race.race_num,
      runners: runners.map((r: any) => ({
        horseName: r.name || r.horseName,
        jockey: r.jockey || 'Unknown',
        trainer: r.trainer || 'Unknown',
        result: r.result || 'LOSS',
      })),
    });
  }

  return enriched;
}

async function enrichRacesWithJockeyTrainer(
  races: EnrichedRace[],
  jockeyTrainerMap: Map<string, JockeyTrainerRecord>
): Promise<EnrichedRace[]> {
  let enrichedCount = 0;
  const enriched: EnrichedRace[] = [];

  for (const race of races) {
    const enrichedRunners: EnrichedRunner[] = [];

    for (const runner of race.runners) {
      const key = `${race.date}-${race.track}-${race.raceNum}-${runner.horseName}`;
      const jockeyTrainerRecord = jockeyTrainerMap.get(key);

      if (jockeyTrainerRecord) {
        enrichedRunners.push({
          horseName: runner.horseName,
          jockey: jockeyTrainerRecord.jockey,
          trainer: jockeyTrainerRecord.trainer,
          result: runner.result,
        });
        enrichedCount++;
      } else {
        // Keep original if no match found
        enrichedRunners.push(runner);
      }
    }

    enriched.push({
      date: race.date,
      track: race.track,
      raceNum: race.raceNum,
      runners: enrichedRunners,
    });
  }

  console.log(`✓ Enriched ${enrichedCount} runners with jockey/trainer data`);
  return enriched;
}

async function relogEnrichedRaces(races: EnrichedRace[]): Promise<void> {
  let raceCount = 0;
  let runnerCount = 0;

  for (const race of races) {
    // Check if this race has any enriched jockey/trainer data
    const hasEnrichedData = race.runners.some(r => r.jockey !== 'Unknown' && r.trainer !== 'Unknown');

    if (!hasEnrichedData) {
      continue; // Skip races with no enrichment
    }

    // Re-insert the race with enriched data
    const raceId = `${race.date}-${race.track}-${race.raceNum}`;

    await sql`
      INSERT INTO manual_races (id, date, track, race_num, runners)
      VALUES (
        ${raceId},
        ${race.date},
        ${race.track},
        ${race.raceNum},
        ${sql.json(race.runners)}
      )
      ON CONFLICT (id) DO UPDATE SET
        runners = EXCLUDED.runners
    `;

    // Re-log all runners to kelly_logs with proper jockey/trainer
    for (const runner of race.runners) {
      await sql`
        INSERT INTO kelly_logs (date, track, race_num, horse_name, jockey, trainer, confidence)
        VALUES (
          ${race.date},
          ${race.track},
          ${race.raceNum},
          ${runner.horseName},
          ${runner.jockey},
          ${runner.trainer},
          50
        )
        ON CONFLICT (date, track, race_num, horse_name) DO UPDATE SET
          jockey = EXCLUDED.jockey,
          trainer = EXCLUDED.trainer
      `;
      runnerCount++;
    }

    raceCount++;
  }

  console.log(`✓ Re-logged ${raceCount} enriched races (${runnerCount} runners) to KB`);
}

async function main() {
  const csvPath = process.argv[2];

  if (!csvPath) {
    console.error('Usage: npx tsx scripts/enrich-betfair-with-jockey-trainer.ts <csv-file-path>');
    console.error('\nCSV format:');
    console.error('date,track,race_num,horse_name,jockey,trainer');
    console.error('2026-04-07,Sale,1,LAUBERHORN,Beau Mertens,Mick Price & Michael Kent Jnr');
    process.exit(1);
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`✗ File not found: ${csvPath}`);
    process.exit(1);
  }

  try {
    console.log('[Betfair KB Enrichment]');
    console.log(`📥 Reading jockey/trainer CSV: ${csvPath}`);

    const jockeyTrainerMap = await parseJockeyTrainerCSV(csvPath);
    console.log(`✓ Loaded ${jockeyTrainerMap.size} jockey/trainer records`);

    console.log(`\n📊 Reading Betfair-imported races from KB...`);
    const races = await getBetfairImportedRaces();
    console.log(`✓ Found ${races.length} races to enrich`);

    console.log(`\n🔄 Enriching with jockey/trainer data...`);
    const enrichedRaces = await enrichRacesWithJockeyTrainer(races, jockeyTrainerMap);

    console.log(`\n💾 Re-logging enriched races to KB...`);
    await relogEnrichedRaces(enrichedRaces);

    console.log(`\n✅ KB enrichment complete!`);
    console.log(`   Jockeys and trainers now properly tracked in knowledge base\n`);
  } catch (err) {
    console.error('[Error]', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
