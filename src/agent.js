import { createAgentApp } from '@lucid-dreams/agent-kit';
import { z } from 'zod';
import dotenv from 'dotenv';

// Import services and detectors
import { getMempoolData } from './services/mempool.js';
import { detectSandwich } from './detectors/sandwich.js';
import { detectFrontRun, detectCopycat } from './detectors/frontrun.js';
import { performHistoricalAnalysis } from './detectors/historical.js';
import {
  generateProtectionSuggestions,
  formatSuggestionsForOutput,
  getDexSpecificRecommendations,
  generateEmergencyRecommendations
} from './services/protection.js';
import { calculatePotentialLoss, getRiskLevel } from './utils/calculations.js';
import { calculateGasPercentile, getMempoolPosition } from './utils/gas.js';
import { initDatabase } from './database/init.js';

// Load environment variables
dotenv.config();

// Initialize database
initDatabase();

// Create agent app (using agent-kit two-parameter format like bridge-route-pinger)
// Check if payment should be enabled
const enablePayment = process.env.ENABLE_PAYMENTS === 'true';

// Create config based on payment setting
const agentConfig = enablePayment
  ? {
      config: {
        payments: {
          facilitatorUrl: process.env.FACILITATOR_URL || 'https://facilitator.daydreams.systems',
          payTo: process.env.PAY_TO_WALLET || '0x992920386E3D950BC260f99C81FDA12419eD4594',
          network: process.env.PAYMENT_NETWORK || 'base',
          defaultPrice: process.env.PAYMENT_AMOUNT || '0.10'
        }
      },
      useConfigPayments: true
    }
  : {}; // No payment config when disabled

const agent = createAgentApp(
  {
    name: 'mev-protection-scanner',
    version: '1.0.0',
    description: 'Detect MEV attacks (sandwich, front-running) and provide protection recommendations for DeFi transactions'
  },
  agentConfig
);

const { addEntrypoint } = agent;

// Main MEV scan entrypoint
addEntrypoint({
  key: 'scan_transaction',
  description: 'Scan a pending DeFi transaction for MEV attack risks (sandwich attacks, front-running) and receive protection recommendations',

  input: z.object({
    transaction_hash: z.string().optional().describe('Optional: Hash of pending transaction to analyze'),
    wallet_address: z.string().optional().describe('Optional: Wallet address planning to trade'),
    token_in: z.string().describe('Token being sold (e.g., "USDC", "ETH")'),
    token_out: z.string().describe('Token being bought (e.g., "ETH", "USDC")'),
    amount_in: z.string().describe('Amount to trade (e.g., "1000")'),
    dex: z.enum(['uniswap-v2', 'uniswap-v3', 'sushiswap', 'curve', 'balancer']).describe('DEX to use for the swap')
  }),

  async handler({ input }) {
    const startTime = Date.now();

    try {
      console.log('🔍 Starting MEV scan for:', input);

      // Step 1: Fetch mempool data
      console.log('📊 Fetching mempool data...');
      const mempoolData = await getMempoolData(input.token_in, input.token_out);

      // Step 2: Run detection algorithms
      console.log('🎯 Running detection algorithms...');

      // Sandwich attack detection
      const sandwichRisk = detectSandwich(input, mempoolData);
      console.log('Sandwich detection:', sandwichRisk.type, 'Score:', sandwichRisk.score);

      // Front-running detection
      const frontRunRisk = detectFrontRun(input, mempoolData);
      console.log('Front-run detection:', frontRunRisk.type, 'Score:', frontRunRisk.score);

      // Copycat detection
      const copycatRisk = detectCopycat(input, mempoolData);
      if (copycatRisk.detected) {
        console.log('⚠️  Copycat transactions detected:', copycatRisk.count);
      }

      // Historical pattern analysis
      const historicalAnalysis = performHistoricalAnalysis(input);
      console.log('Historical risk score:', historicalAnalysis.riskScore);

      // Step 3: Calculate overall risk score
      // Weight: Sandwich (45%), Front-run (35%), Historical (20%)
      const baseRiskScore = Math.max(
        sandwichRisk.score * 0.45 +
        frontRunRisk.score * 0.35 +
        historicalAnalysis.riskScore * 0.20
      );

      // Add copycat risk if detected
      const riskScore = Math.min(
        Math.round(baseRiskScore + copycatRisk.riskIncrease),
        100
      );

      // Determine primary attack type
      const attackType = determineAttackType(sandwichRisk, frontRunRisk, copycatRisk);

      console.log('📈 Final risk score:', riskScore, '| Attack type:', attackType);

      // Step 4: Calculate potential loss
      const estimatedLoss = calculatePotentialLoss(input, riskScore);

      // Step 5: Determine risk level
      const riskLevel = getRiskLevel(riskScore);

      // Step 6: Calculate mempool position
      const userGasPrice = parseFloat(mempoolData.gasPercentiles.p50); // Assume median if not specified
      const gasPercentile = calculateGasPercentile(userGasPrice, mempoolData.gasPercentiles);
      const mempoolPosition = getMempoolPosition(gasPercentile);

      // Step 7: Generate protection suggestions
      const suggestions = generateProtectionSuggestions(
        riskScore,
        attackType,
        mempoolData,
        input
      );

      // Add DEX-specific recommendations
      const dexRecommendations = getDexSpecificRecommendations(input.dex, riskScore);
      suggestions.push(...dexRecommendations);

      // Format suggestions for output
      const formattedSuggestions = formatSuggestionsForOutput(suggestions);

      // Generate emergency recommendations if critical
      const emergency = generateEmergencyRecommendations({
        riskScore,
        attackType,
        estimatedLoss
      });

      // Step 8: Prepare response
      const responseTime = Date.now() - startTime;

      const result = {
        risk_score: riskScore,
        attack_type: attackType,
        risk_level: riskLevel,
        estimated_loss_usd: estimatedLoss,
        similar_attacks_found: historicalAnalysis.similarAttacksFound || 0,
        protection_suggestions: formattedSuggestions,
        details: {
          mempool_position: mempoolPosition,
          gas_price_percentile: gasPercentile,
          competing_txs: mempoolData.competingTxs.length,
          block_time_estimate: mempoolData.blockTimeEstimate,
          detection_confidence: calculateOverallConfidence(sandwichRisk, frontRunRisk),
          response_time_ms: responseTime
        },
        analysis: {
          sandwich_detection: {
            score: sandwichRisk.score,
            type: sandwichRisk.type,
            confidence: sandwichRisk.confidence,
            front_runners: sandwichRisk.details?.frontRunners?.length || 0,
            back_runners: sandwichRisk.details?.backRunners?.length || 0
          },
          frontrun_detection: {
            score: frontRunRisk.score,
            type: frontRunRisk.type,
            confidence: frontRunRisk.confidence,
            competitors: frontRunRisk.details?.competitors || 0
          },
          historical_analysis: {
            risk_score: historicalAnalysis.riskScore,
            total_attacks: historicalAnalysis.patternAnalysis.totalAttacks,
            recent_attacks: historicalAnalysis.patternAnalysis.recentAttacks,
            is_high_risk_pair: historicalAnalysis.patternAnalysis.isHighRiskPair
          }
        }
      };

      // Add emergency alert if critical
      if (emergency) {
        result.emergency = emergency;
      }

      // Log completion
      console.log('✅ Scan completed in', responseTime, 'ms');
      console.log(JSON.stringify({
        timestamp: Date.now(),
        event: 'scan_completed',
        risk_score: riskScore,
        attack_type: attackType,
        response_time_ms: responseTime,
        token_pair: `${input.token_in}/${input.token_out}`
      }));

      return {
        output: result,
        usage: { total_tokens: 1 } // Flat fee, not token-based
      };

    } catch (error) {
      console.error('❌ MEV scan error:', error);

      return {
        output: {
          error: 'Failed to scan transaction',
          message: error.message,
          risk_score: 0,
          attack_type: 'unknown',
          risk_level: 'unknown',
          protection_suggestions: [
            '⚠️ ERROR: Scan failed. Please try again or contact support.',
            '✅ As a precaution, consider using Flashbots Protect RPC for your transaction.'
          ]
        },
        usage: { total_tokens: 0 } // No charge on error
      };
    }
  }
});

/**
 * Determine the primary attack type based on detection results
 */
function determineAttackType(sandwichRisk, frontRunRisk, copycatRisk) {
  // Copycat is most specific
  if (copycatRisk.detected) {
    return 'copycat-frontrun';
  }

  // Sandwich takes precedence if scores are close
  if (sandwichRisk.score >= frontRunRisk.score * 0.9) {
    return sandwichRisk.type;
  }

  return frontRunRisk.type;
}

/**
 * Calculate overall confidence score
 */
function calculateOverallConfidence(sandwichRisk, frontRunRisk) {
  const avgConfidence = (sandwichRisk.confidence + frontRunRisk.confidence) / 2;
  return Math.round(avgConfidence * 100) / 100;
}

// Export the agent (server startup handled by src/index.js)
export default agent;
