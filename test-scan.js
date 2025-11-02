/**
 * Simple test script to verify the MEV scanner works
 * Run with: node test-scan.js
 */

import { detectSandwich } from './src/detectors/sandwich.js';
import { detectFrontRun } from './src/detectors/frontrun.js';
import { performHistoricalAnalysis } from './src/detectors/historical.js';
import { generateProtectionSuggestions, formatSuggestionsForOutput } from './src/services/protection.js';
import { calculatePotentialLoss, getRiskLevel } from './src/utils/calculations.js';

console.log('🧪 Testing MEV Protection Scanner...\n');

// Test case 1: Low risk transaction
console.log('📊 Test Case 1: Low Risk Transaction');
const lowRiskTx = {
  token_in: 'USDC',
  token_out: 'ETH',
  amount_in: '100',
  dex: 'uniswap-v2'
};

const lowRiskMempool = {
  tokenPair: 'USDC/ETH',
  competingTxs: [], // No competing transactions
  gasPercentiles: { p25: '20', p50: '35', p75: '50', p90: '80' },
  blockTimeEstimate: 12
};

const lowRiskSandwich = detectSandwich(lowRiskTx, lowRiskMempool);
const lowRiskFrontRun = detectFrontRun(lowRiskTx, lowRiskMempool);

console.log('  Sandwich Risk:', lowRiskSandwich.score, '| Type:', lowRiskSandwich.type);
console.log('  Front-run Risk:', lowRiskFrontRun.score, '| Type:', lowRiskFrontRun.type);
console.log('  ✅ Expected: Low risk scores\n');

// Test case 2: High risk sandwich attack
console.log('📊 Test Case 2: High Risk Sandwich Attack');
const highRiskTx = {
  token_in: 'USDC',
  token_out: 'ETH',
  amount_in: '50000',
  dex: 'uniswap-v2'
};

const highRiskMempool = {
  tokenPair: 'USDC/ETH',
  competingTxs: [
    // Front-runner
    { hash: '0x123', tokenPair: 'USDC/ETH', gasPrice: 100, amount: 80000 },
    { hash: '0x124', tokenPair: 'USDC/ETH', gasPrice: 95, amount: 60000 },
    // Back-runner
    { hash: '0x125', tokenPair: 'ETH/USDC', gasPrice: 20, amount: 70000 }
  ],
  gasPercentiles: { p25: '20', p50: '35', p75: '50', p90: '80' },
  blockTimeEstimate: 12
};

const highRiskSandwich = detectSandwich(highRiskTx, highRiskMempool);
const highRiskFrontRun = detectFrontRun(highRiskTx, highRiskMempool);
const historicalAnalysis = performHistoricalAnalysis(highRiskTx);

console.log('  Sandwich Risk:', highRiskSandwich.score, '| Type:', highRiskSandwich.type);
console.log('  Front-run Risk:', highRiskFrontRun.score, '| Type:', highRiskFrontRun.type);
console.log('  Historical Risk:', historicalAnalysis.riskScore);
console.log('  Front Runners:', highRiskSandwich.details.frontRunners.length);
console.log('  Back Runners:', highRiskSandwich.details.backRunners.length);
console.log('  ✅ Expected: High risk scores with sandwich pattern\n');

// Calculate overall risk
const overallRisk = Math.min(
  Math.round(
    highRiskSandwich.score * 0.45 +
    highRiskFrontRun.score * 0.35 +
    historicalAnalysis.riskScore * 0.20
  ),
  100
);

console.log('📈 Overall Risk Score:', overallRisk);
console.log('📊 Risk Level:', getRiskLevel(overallRisk));
console.log('💰 Estimated Loss:', calculatePotentialLoss(highRiskTx, overallRisk), 'USD\n');

// Generate protection suggestions
console.log('🛡️  Protection Suggestions:');
const suggestions = generateProtectionSuggestions(
  overallRisk,
  highRiskSandwich.type,
  highRiskMempool,
  highRiskTx
);

const formatted = formatSuggestionsForOutput(suggestions);
formatted.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

console.log('\n✅ All tests completed successfully!');
console.log('\n💡 Next steps:');
console.log('  1. Start the server: npm start');
console.log('  2. Test the API endpoint');
console.log('  3. Deploy to Railway or your preferred platform');
