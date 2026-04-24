#!/usr/bin/env node
/**
 * Extract racing form data from Sportsbet PDF form guides
 * Parses horses, jockeys, trainers, odds, form lines
 */

import pdf from 'pdf-parse/lib/pdf-parse.js';
import * as fs from 'fs';
import path from 'node:path';

export interface ExtractedRace {
  track: string;
  raceNum: number;
  distance?: string;
  raceClass?: string;
  runners: Array<{
    number?: number;
    name: string;
    jockey?: string;
    trainer?: string;
    weight?: string;
    barrier?: string;
    odds?: number;
    form?: string;
  }>;
}

/**
 * Extract text from PDF file
 */
async function extractPDFText(pdfPath: string): Promise<string> {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    return data.text;
  } catch (err) {
    console.error(`Error reading PDF ${pdfPath}:`, err);
    return '';
  }
}

/**
 * Parse form guide text to extract races
 */
function parseFormGuideText(text: string, filename: string): ExtractedRace[] {
  const races: ExtractedRace[] = [];

  // Extract track name from filename: "20260408_eagle_farm_435617.pdf"
  const trackMatch = filename.match(/_([\w\s]+)_\d+\.pdf/);
  const track = trackMatch ? trackMatch[1].toUpperCase().replace(/_/g, ' ') : 'UNKNOWN';

  // Split by race sections (usually marked by "RACE" or "R1", "R2", etc.)
  const racePattern = /(?:RACE\s*(\d+)|R\s*(\d+))[^\n]*\n([\s\S]*?)(?=(?:RACE\s*\d+|R\s*\d+|$))/gi;
  let match;

  while ((match = racePattern.exec(text))) {
    const raceNum = parseInt(match[1] || match[2]);
    const raceSection = match[3];

    // Extract runners from this race section
    const runners: ExtractedRace['runners'] = [];

    // Look for horse entries (usually numbered or with specific patterns)
    // Pattern: number. HORSE NAME | JOCKEY | TRAINER | etc
    const horsePattern = /(\d+)\.\s*([A-Z][A-Z\s'-]{2,40})\s+([\w\s]+)\s+([\w\s]+)?/gm;

    let horseMatch;
    while ((horseMatch = horsePattern.exec(raceSection))) {
      const [, num, horseName, jockey, trainer] = horseMatch;

      // Extract odds if available in the line
      const fullLine = horseMatch[0];
      const oddsMatch = fullLine.match(/(\d+\.\d+)/);
      const odds = oddsMatch ? parseFloat(oddsMatch[1]) : undefined;

      if (horseName && horseName.length > 2) {
        runners.push({
          number: parseInt(num),
          name: horseName.trim().toUpperCase(),
          jockey: jockey?.trim(),
          trainer: trainer?.trim(),
          odds,
        });
      }
    }

    // Alternative pattern if above doesn't work: just extract horse names and odds
    if (runners.length < 5) {
      runners.length = 0;

      const lines = raceSection.split('\n');
      for (const line of lines) {
        // Look for lines with odds
        const oddsMatch = line.match(/(\d+\.\d+)/);
        if (oddsMatch) {
          const odds = parseFloat(oddsMatch[1]);
          if (odds > 1 && odds < 100) {
            // Horse name is usually before odds
            const namePart = line.split(/\d+\.\d+/)[0].trim().toUpperCase();
            if (namePart.length > 2 && namePart.length < 50 && /^[A-Z]/.test(namePart)) {
              // Check if not duplicate
              if (!runners.some(r => r.name === namePart)) {
                runners.push({
                  name: namePart,
                  odds,
                });
              }
            }
          }
        }
      }
    }

    if (runners.length >= 3) {
      races.push({
        track,
        raceNum,
        runners,
      });
    }
  }

  return races;
}

/**
 * Process all PDF files and extract race data
 */
async function processPDFs(pdfDir: string): Promise<ExtractedRace[]> {
  const allRaces: ExtractedRace[] = [];

  try {
    const files = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));

    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║    PDF FORM EXTRACTOR                  ║`);
    console.log(`╚════════════════════════════════════════╝\n`);

    for (const file of files) {
      const pdfPath = path.join(pdfDir, file);
      console.log(`Processing: ${file}`);

      const text = await extractPDFText(pdfPath);
      const races = parseFormGuideText(text, file);

      console.log(`  Found: ${races.length} races`);

      for (const race of races) {
        const existing = allRaces.find(r => r.track === race.track && r.raceNum === race.raceNum);
        if (!existing) {
          allRaces.push(race);
        }
      }
    }

    console.log(`\n✓ Extracted ${allRaces.length} unique races\n`);

    // Display sample
    allRaces.slice(0, 3).forEach(race => {
      console.log(`${race.track} R${race.raceNum} - ${race.runners.length} runners`);
      race.runners.slice(0, 3).forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.name} @${r.odds ? '$' + r.odds : 'N/A'}`);
      });
    });

    return allRaces;
  } catch (err) {
    console.error('Error processing PDFs:', err);
    return allRaces;
  }
}

// Test
processPDFs('/tmp');
