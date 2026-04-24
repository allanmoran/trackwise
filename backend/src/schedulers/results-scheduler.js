/**
 * Results Scheduler
 * Runs at 6pm daily to scrape race results and update bets
 * Automatically triggers KB feedback after results are collected
 */

import cron from 'node-cron';
import db from '../db.js';
import fetch from 'node-fetch';

const SCRAPE_TIME = '0 18 * * *'; // 6pm daily
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';

let scrapeJob = null;

/**
 * Trigger results scraping via API
 */
async function triggerScrape() {
  try {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║     📊 Scheduled Results Scraper - 6pm Trigger     ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    const response = await fetch(`${SERVER_URL}/api/results/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const data = await response.json();

    if (!data.success) {
      console.error('❌ Scrape failed:', data.error);
      return;
    }

    console.log(`✅ Scrape job started: ${data.jobId}`);
    console.log(`   Pending bets: ${data.pending}`);

    // Poll for job completion
    await waitForJobCompletion(data.jobId);

    // After results are in, trigger KB update
    console.log('\n🔄 Triggering KB feedback update...');
    await triggerKBUpdate();

  } catch (err) {
    console.error('❌ Scheduler error:', err.message);
  }
}

/**
 * Poll job status until complete
 */
async function waitForJobCompletion(jobId, maxWait = 300000) {
  const startTime = Date.now();
  const pollInterval = 5000; // Check every 5 seconds

  while (Date.now() - startTime < maxWait) {
    try {
      const response = await fetch(`${SERVER_URL}/api/results/job/${jobId}`);
      const data = await response.json();

      if (!data.success) {
        console.error(`   ⚠️  Job error: ${data.error}`);
        return;
      }

      const job = data.job;

      if (job.status === 'completed') {
        console.log(`   ✅ Job complete: ${job.updated}/${job.total} bets settled`);
        console.log(`   💰 Total settled: ${job.totalSettled}`);
        return;
      }

      if (job.status === 'failed') {
        console.error(`   ❌ Job failed: ${job.error}`);
        return;
      }

      // Still running
      console.log(`   ⏳ Running... ${job.updated}/${job.total} bets processed`);
      await new Promise(r => setTimeout(r, pollInterval));

    } catch (err) {
      console.error(`   ⚠️  Poll error: ${err.message}`);
      await new Promise(r => setTimeout(r, pollInterval));
    }
  }

  console.warn(`   ⏱️  Job still running after ${maxWait / 1000}s, continuing...`);
}

/**
 * Trigger KB update to process settled bets
 */
async function triggerKBUpdate() {
  try {
    const response = await fetch(`${SERVER_URL}/api/kb/update-from-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const data = await response.json();

    if (data.success) {
      console.log(`✅ KB updated: ${data.summary}`);

      // After KB is updated, trigger model retraining
      console.log('\n🔄 Triggering model retraining...');
      await triggerModelRetrain();
    } else {
      console.error(`⚠️  KB update warning: ${data.message}`);
    }
  } catch (err) {
    console.error(`⚠️  KB update error: ${err.message}`);
  }
}

/**
 * Trigger model retraining
 */
async function triggerModelRetrain() {
  try {
    const response = await fetch(`${SERVER_URL}/api/model/retrain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const data = await response.json();

    if (data.success) {
      const report = data.report;
      console.log(`✅ Model retrained`);
      if (report.accuracy) {
        console.log(`   Strike rate: ${report.accuracy.strikeRate}%`);
      }
      if (report.recommendations && report.recommendations.length > 0) {
        console.log(`   Recommendations: ${report.recommendations.length}`);
      }
    } else {
      console.error(`⚠️  Retraining warning: ${data.error}`);
    }
  } catch (err) {
    console.error(`⚠️  Retraining error: ${err.message}`);
  }
}

/**
 * Start the scheduler
 */
export function startScheduler() {
  if (scrapeJob) {
    console.log('⚠️  Scheduler already running');
    return;
  }

  scrapeJob = cron.schedule(SCRAPE_TIME, () => {
    triggerScrape();
  });

  console.log('\n📅 Results Scheduler Started');
  console.log(`   Trigger: Daily at 6pm (${SCRAPE_TIME})`);
  console.log('   Action: Scrape results → Update KB → Retrain model\n');
}

/**
 * Stop the scheduler
 */
export function stopScheduler() {
  if (scrapeJob) {
    scrapeJob.stop();
    scrapeJob = null;
    console.log('⏹️  Scheduler stopped');
  }
}

/**
 * Manually trigger scrape (for testing)
 */
export async function manualTrigger() {
  console.log('🔧 Manual trigger invoked');
  await triggerScrape();
}
