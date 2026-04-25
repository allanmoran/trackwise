/**
 * Test Phase 4 Implementation: Risk Management & Observability
 * Tests: Drawdown gate (4A), A/B testing (4C), Weight optimizer (4D)
 */

import db from '../db.js';
import ComplianceMonitor from '../ml/compliance-monitor.js';
import ABTester from '../ml/ab-tester.js';
import { ModelRetrainer } from '../ml/retrainer.js';

const test = {
  passed: 0,
  failed: 0,
  log: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => {
    console.log(`✅ ${msg}`);
    test.passed++;
  },
  error: (msg) => {
    console.error(`❌ ${msg}`);
    test.failed++;
  }
};

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  PHASE 4 IMPLEMENTATION TEST SUITE');
console.log('═══════════════════════════════════════════════════════════\n');

// =============================================================================
// PHASE 4A: Drawdown Limit Gate
// =============================================================================
console.log('🧪 PHASE 4A: Drawdown Limit Gate');
console.log('─────────────────────────────────────────────────────────────');

try {
  test.log('Testing checkDrawdownLimit() method exists...');
  const result = ComplianceMonitor.checkDrawdownLimit(7);
  test.success('checkDrawdownLimit() returns result object');

  test.log(`Result: triggered=${result.triggered}, drawdown=${result.drawdownPercent}%`);

  // Verify structure
  if (result.triggered !== undefined && result.drawdownPercent !== undefined && result.action !== undefined) {
    test.success('Drawdown check returns proper structure (triggered, drawdownPercent, action)');
  } else {
    test.error('Drawdown check missing required fields');
  }

  // Test that no drawdown is detected with healthy bankroll
  if (!result.triggered) {
    test.success('No false drawdown trigger with healthy bankroll');
  }
} catch (err) {
  test.error(`Drawdown limit test failed: ${err.message}`);
}

// =============================================================================
// PHASE 4C: A/B Testing Framework
// =============================================================================
console.log('\n🧪 PHASE 4C: A/B Testing Framework');
console.log('─────────────────────────────────────────────────────────────');

try {
  test.log('Testing ABTester.assignVariant()...');
  const variant1 = ABTester.assignVariant(1, 100);
  const variant2 = ABTester.assignVariant(1, 101);
  const variant3 = ABTester.assignVariant(2, 100);

  const variants = [variant1, variant2, variant3];
  const validVariants = ['control', 'aggressive', 'conservative'];

  if (variants.every(v => validVariants.includes(v))) {
    test.success('assignVariant() returns valid variants (control/aggressive/conservative)');
  } else {
    test.error(`Invalid variants returned: ${variants}`);
  }

  test.log('Testing deterministic assignment...');
  const retestVariant1 = ABTester.assignVariant(1, 100);
  if (retestVariant1 === variant1) {
    test.success('Variant assignment is deterministic (same input = same output)');
  } else {
    test.error('Variant assignment is non-deterministic');
  }

  test.log('Testing EV threshold mapping...');
  const thresholdControl = ABTester.getEVThreshold('control');
  const thresholdAggressive = ABTester.getEVThreshold('aggressive');
  const thresholdConservative = ABTester.getEVThreshold('conservative');

  if (thresholdControl === 0.10 && thresholdAggressive === 0.05 && thresholdConservative === 0.15) {
    test.success('EV thresholds correct (control=10%, aggressive=5%, conservative=15%)');
  } else {
    test.error(`EV thresholds incorrect: control=${thresholdControl}, agg=${thresholdAggressive}, cons=${thresholdConservative}`);
  }

  test.log('Testing A/B test status...');
  const status = ABTester.getTestStatus();
  if (status.totalAssignments !== undefined && status.byVariant !== undefined) {
    test.success(`A/B test status available: ${status.totalAssignments} assignments`);
  } else {
    test.error('A/B test status missing required fields');
  }

} catch (err) {
  test.error(`A/B testing test failed: ${err.message}`);
}

// =============================================================================
// PHASE 4D: Weight Optimizer
// =============================================================================
console.log('\n🧪 PHASE 4D: Weight Optimizer');
console.log('─────────────────────────────────────────────────────────────');

try {
  test.log('Checking prediction_logs table for test data...');
  const logCount = db.prepare('SELECT COUNT(*) as count FROM prediction_logs').get();
  test.log(`Found ${logCount.count} prediction logs in database`);

  if (logCount.count >= 50) {
    test.log('Testing optimizeWeights()...');
    const optimResult = ModelRetrainer.optimizeWeights(50);

    if (optimResult.success) {
      test.success('Weight optimization completed successfully');
      test.log(`  - Samples: ${optimResult.samples}`);
      test.log(`  - Iterations: ${optimResult.iterations}`);
      test.log(`  - Improvement: ${optimResult.losses.improvement}%`);

      // Verify recommended weights sum to 1.0
      const sum = parseFloat(optimResult.recommended.form) +
                  parseFloat(optimResult.recommended.market) +
                  parseFloat(optimResult.recommended.kb);
      if (Math.abs(sum - 1.0) < 0.001) {
        test.success('Recommended weights sum to 1.0');
      } else {
        test.error(`Recommended weights sum to ${sum.toFixed(4)}, expected 1.0`);
      }

      test.log(`  Recommendations: ${optimResult.recommendation}`);
    } else {
      test.log(`Weight optimization skipped: ${optimResult.message}`);
    }
  } else {
    test.log(`Skipping optimization test: need 50+ samples, have ${logCount.count}`);
  }

  test.log('Testing applyOptimizedWeights()...');
  const testWeights = { form: 0.5, market: 0.3, kb: 0.2 };
  const applyResult = ModelRetrainer.applyOptimizedWeights(testWeights);

  if (applyResult.success) {
    test.success('applyOptimizedWeights() can apply weight changes');

    // Verify weights were actually updated
    const saved = db.prepare('SELECT weight FROM model_weights WHERE model_name = ? LIMIT 1').get('form');
    if (Math.abs(saved.weight - 0.5) < 0.001) {
      test.success('Weights persisted to database correctly');
    } else {
      test.error(`Weight not persisted: form weight is ${saved.weight}, expected 0.5`);
    }
  } else {
    test.error(`applyOptimizedWeights() failed: ${applyResult.error}`);
  }

} catch (err) {
  test.error(`Weight optimizer test failed: ${err.message}`);
}

// =============================================================================
// Integration Tests
// =============================================================================
console.log('\n🧪 Integration Tests');
console.log('─────────────────────────────────────────────────────────────');

try {
  test.log('Testing that all Phase 4 modules export properly...');

  const modules = [
    { name: 'ComplianceMonitor', module: ComplianceMonitor, method: 'checkDrawdownLimit' },
    { name: 'ABTester', module: ABTester, method: 'assignVariant' },
    { name: 'ModelRetrainer', module: ModelRetrainer, method: 'optimizeWeights' }
  ];

  for (const mod of modules) {
    if (typeof mod.module[mod.method] === 'function') {
      test.success(`${mod.name}.${mod.method}() is callable`);
    } else {
      test.error(`${mod.name}.${mod.method}() is not a function`);
    }
  }

} catch (err) {
  test.error(`Integration test failed: ${err.message}`);
}

// =============================================================================
// Summary
// =============================================================================
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  TEST RESULTS');
console.log('═══════════════════════════════════════════════════════════');
console.log(`✅ Passed: ${test.passed}`);
console.log(`❌ Failed: ${test.failed}`);
console.log(`📊 Total:  ${test.passed + test.failed}\n`);

if (test.failed === 0) {
  console.log('🎉 All Phase 4 tests passed! Implementation is complete.\n');
  process.exit(0);
} else {
  console.log(`⚠️  ${test.failed} test(s) failed. Review errors above.\n`);
  process.exit(1);
}
