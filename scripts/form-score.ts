/**
 * scripts/form-score.ts
 *
 * Composite form scoring engine for TrackWise.
 *
 * Combines 6 signals into a single 0–100 score:
 *   1. Form Quality   (25%) — strike rate + recency from last 6 runs
 *   2. Speed Rating   (20%) — racingandsports.com speed/class/neural ratings
 *   3. Jockey         (20%) — season win%, tier, track record
 *   4. Trainer        (15%) — season win%, tier
 *   5. Track/Distance (10%) — proven at this track+distance combo
 *   6. Market Signal  (10%) — odds as market-implied probability
 *
 * All weights are normalised to 0–1 before blending.
 */

import type { RunnerForm, JockeyStats, TrainerStats, FormRun, TrackDistRecord } from './scrapers/racingAndSports.js';

export interface FormScore {
  total:         number;   // 0–100 composite
  formQuality:   number;   // 0–25
  speedScore:    number;   // 0–20
  jockeyScore:   number;   // 0–20
  trainerScore:  number;   // 0–15
  trackDistScore:number;   // 0–10
  marketScore:   number;   // 0–10
  explanation:   string;
}

export interface ScoredRunner {
  name:       string;
  odds:       number;
  formScore:  FormScore;
  eligible:   boolean;
  skipReason?: string;
}

// ── 1. Form Quality ────────────────────────────────────────────────────────────
// Analyses the last 6 form runs for recency, consistency, and strike rate.

function scoreFormQuality(last6: FormRun[]): number {
  if (!last6 || last6.length === 0) return 0;

  let score = 0;
  const MAX = 25;

  // Strike rate from last 6
  const finishes = last6.filter(r => r.pos !== 'x' && r.pos !== '?');
  if (finishes.length === 0) return 0;

  const wins   = finishes.filter(r => r.pos === '1').length;
  const places = finishes.filter(r => ['1','2','3'].includes(r.pos)).length;
  const strikeRate   = wins   / finishes.length;  // 0–1
  const placeRate    = places / finishes.length;   // 0–1

  // Base: strike rate (50%) + place rate (30%)
  score += strikeRate * 12.5;  // max 12.5
  score += placeRate  * 7.5;   // max 7.5

  // Recency bonus: weight recent runs more heavily
  // Run at index 0 = most recent
  const recencyWeights = [0.35, 0.25, 0.18, 0.12, 0.07, 0.03];
  let recencyScore = 0;
  finishes.slice(0, 6).forEach((run, i) => {
    const w = recencyWeights[i] ?? 0;
    const pos = parseInt(run.pos);
    if      (pos === 1)           recencyScore += w * 1.0;
    else if (pos <= 3)            recencyScore += w * 0.6;
    else if (pos <= 6)            recencyScore += w * 0.2;
    // unplaced = 0
  });
  score += recencyScore * 5; // max 5 when all recent runs are wins

  return Math.min(Math.round(score * 10) / 10, MAX);
}

// ── 2. Speed Rating ─────────────────────────────────────────────────────────────
// racingandsports returns speedRating (0–100), classRating (0–100), neuralRating (rank).

function scoreSpeed(form: RunnerForm, fieldSize: number): number {
  const MAX = 20;
  let score = 0;

  if (form.speedRating != null) {
    // Speed rating: already 0–100, normalise to 0–10
    score += (form.speedRating / 100) * 10;
  }

  if (form.classRating != null) {
    // Class rating: already 0–100, normalise to 0–6
    score += (form.classRating / 100) * 6;
  }

  if (form.neuralRating != null && fieldSize > 0) {
    // Neural = model rank (1 = best). Invert so rank 1 → 4pts, last → 0pts
    const normalised = 1 - ((form.neuralRating - 1) / Math.max(fieldSize - 1, 1));
    score += normalised * 4;
  }

  return Math.min(Math.round(score * 10) / 10, MAX);
}

// ── 3. Jockey Score ─────────────────────────────────────────────────────────────

function scoreJockey(jockey: JockeyStats | null): number {
  const MAX = 20;
  if (!jockey) return MAX * 0.3; // neutral 30% if no data

  let score = 0;

  // Win% contribution (max 14pts)
  // Elite (>18%) = 14, Solid (10-18%) = 9, Emerging (<10%) = 4
  if      (jockey.tier === 1) score += 14;
  else if (jockey.tier === 2) score += 9;
  else                         score += 4;

  // Volume bonus: more rides = more reliable signal (max 6pts)
  const volumeBonus = Math.min(jockey.seasonRides / 200, 1) * 6;
  score += volumeBonus;

  return Math.min(Math.round(score * 10) / 10, MAX);
}

// ── 4. Trainer Score ────────────────────────────────────────────────────────────

function scoreTrainer(trainer: TrainerStats | null): number {
  const MAX = 15;
  if (!trainer) return MAX * 0.3; // neutral

  let score = 0;

  if      (trainer.tier === 1) score += 10;
  else if (trainer.tier === 2) score += 6.5;
  else                          score += 3;

  const volumeBonus = Math.min(trainer.seasonRides / 200, 1) * 5;
  score += volumeBonus;

  return Math.min(Math.round(score * 10) / 10, MAX);
}

// ── 5. Track/Distance Score ──────────────────────────────────────────────────────

function scoreTrackDist(td: TrackDistRecord | null): number {
  const MAX = 10;
  if (!td || td.starts === 0) return 0;

  const winRate   = td.wins   / td.starts;
  const placeRate = (td.wins + td.places) / td.starts;

  let score = winRate * 6 + placeRate * 4;
  return Math.min(Math.round(score * 10) / 10, MAX);
}

// ── 6. Market Signal ────────────────────────────────────────────────────────────
// Odds imply probability. Tighter odds = stronger market confidence.

function scoreMarket(odds: number): number {
  const MAX = 10;
  if (!odds || odds <= 0) return 0;

  // Implied prob = 1/odds. Map 1.5→10 odds → 10→4pts
  const impliedProb = 1 / odds;

  // Logistic-ish: odds 1.5 = 0.67 prob → full 10pts; odds 10 = 0.10 prob → 1pt
  const score = Math.min(impliedProb * 15, MAX);
  return Math.round(score * 10) / 10;
}

// ── Composite Scorer ────────────────────────────────────────────────────────────

export function scoreRunner(
  form: RunnerForm,
  odds: number,
  fieldSize: number,
): FormScore {
  const formQuality    = scoreFormQuality(form.last6);
  const speedScore     = scoreSpeed(form, fieldSize);
  const jockeyScore    = scoreJockey(form.jockeyStats);
  const trainerScore   = scoreTrainer(form.trainerStats);
  const trackDistScore = scoreTrackDist(form.trackDistRecord);
  const marketScore    = scoreMarket(odds);

  const total = Math.round(
    formQuality + speedScore + jockeyScore + trainerScore + trackDistScore + marketScore
  );

  const parts: string[] = [];
  if (form.jockeyStats)     parts.push(`J:${form.jockeyStats.name}(${(form.jockeyStats.winPct * 100).toFixed(0)}%)`);
  if (form.trainerStats)    parts.push(`T:${form.trainerStats.name}(${(form.trainerStats.winPct * 100).toFixed(0)}%)`);
  if (form.speedRating)     parts.push(`SR:${form.speedRating}`);
  if (form.last6?.length)   parts.push(`F:${form.last6.slice(0, 4).map(r => r.pos).join('-')}`);

  const explanation = parts.join(' | ') || 'No form data';

  return { total, formQuality, speedScore, jockeyScore, trainerScore, trackDistScore, marketScore, explanation };
}

// ── Score a full field ─────────────────────────────────────────────────────────

export function scoreField(
  runners: Array<{ name: string; odds: number }>,
  formData: RunnerForm[],
  minOdds = 1.5,
  maxOdds = 20,
): ScoredRunner[] {
  const fieldSize = runners.length;

  return runners.map(r => {
    const form = formData.find(f =>
      normalise(f.name) === normalise(r.name) ||
      normalise(f.name).includes(normalise(r.name)) ||
      normalise(r.name).includes(normalise(f.name))
    );

    if (!form) {
      // No form data — fall back to market only
      const marketScore = scoreMarket(r.odds);
      const total       = Math.round(marketScore + scoreJockey(null) + scoreTrainer(null));
      return {
        name: r.name,
        odds: r.odds,
        formScore: {
          total,
          formQuality: 0,
          speedScore: 0,
          jockeyScore: scoreJockey(null),
          trainerScore: scoreTrainer(null),
          trackDistScore: 0,
          marketScore,
          explanation: 'No form data — market signal only',
        },
        eligible: r.odds >= minOdds && r.odds <= maxOdds,
        skipReason: r.odds < minOdds ? `Odds $${r.odds} too short`
                  : r.odds > maxOdds ? `Odds $${r.odds} too long`
                  : undefined,
      };
    }

    const fs = scoreRunner(form, r.odds, fieldSize);

    let eligible   = true;
    let skipReason: string | undefined;
    if (r.odds < minOdds) { eligible = false; skipReason = `Odds $${r.odds.toFixed(2)} too short (min $${minOdds})`; }
    if (r.odds > maxOdds) { eligible = false; skipReason = `Odds $${r.odds.toFixed(2)} too long (max $${maxOdds})`; }

    return { name: r.name, odds: r.odds, formScore: fs, eligible, skipReason };
  }).sort((a, b) => b.formScore.total - a.formScore.total);
}

// ── Pick best eligible runner ──────────────────────────────────────────────────

export interface PickResult {
  horse:          string;
  odds:           number;
  score:          number;
  reason:         string;
  jockey?:        string;
  trainer?:       string;
  speedRating?:   number;
}

export function pickBest(scored: ScoredRunner[], formData: RunnerForm[]): PickResult | null {
  const eligible = scored.filter(r => r.eligible);
  if (eligible.length === 0) return null;

  const best = eligible[0]; // Already sorted by total score
  const form = formData.find(f =>
    normalise(f.name) === normalise(best.name) ||
    normalise(f.name).includes(normalise(best.name))
  );

  return {
    horse:        best.name,
    odds:         best.odds,
    score:        best.formScore.total,
    reason:       best.formScore.explanation,
    jockey:       form?.jockeyStats?.name,
    trainer:      form?.trainerStats?.name,
    speedRating:  form?.speedRating ?? undefined,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export { normalise };
