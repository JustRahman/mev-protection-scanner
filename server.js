import express from 'express';
import dotenv from 'dotenv';
import { z } from 'zod';

// Import services and detectors
import { getMempoolData } from './src/services/mempool.js';
import { detectSandwich } from './src/detectors/sandwich.js';
import { detectFrontRun, detectCopycat } from './src/detectors/frontrun.js';
import { performHistoricalAnalysis } from './src/detectors/historical.js';
import {
  generateProtectionSuggestions,
  formatSuggestionsForOutput,
  getDexSpecificRecommendations,
} from './src/services/protection.js';
import { calculatePotentialLoss, getRiskLevel } from './src/utils/calculations.js';
import { calculateGasPercentile, getMempoolPosition } from './src/utils/gas.js';
import { initDatabase } from './src/database/init.js';

// Load environment variables
dotenv.config();

// Initialize database
initDatabase();

const app = express();
app.use(express.json());

// Request validation schema
const scanRequestSchema = z.object({
  transaction_hash: z.string().optional(),
  wallet_address: z.string().optional(),
  token_in: z.string().min(1),
  token_out: z.string().min(1),
  amount_in: z.string().min(1),
  dex: z.enum(['uniswap-v2', 'uniswap-v3', 'sushiswap', 'curve', 'balancer'])
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: Date.now(),
    version: '1.0.0'
  });
});

// Main scan endpoint
app.post('/api/v1/scan_transaction', async (req, res) => {
  const startTime = Date.now();

  try {
    // Validate input
    const input = scanRequestSchema.parse(req.body);
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
    const userGasPrice = parseFloat(mempoolData.gasPercentiles.p50);
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

    res.json(result);

  } catch (error) {
    console.error('❌ MEV scan error:', error);

    const errorResponse = {
      error: 'Failed to scan transaction',
      message: error.message,
      risk_score: 0,
      attack_type: 'unknown',
      risk_level: 'unknown',
      protection_suggestions: [
        '⚠️ ERROR: Scan failed. Please try again or contact support.',
        '✅ As a precaution, consider using Flashbots Protect RPC for your transaction.'
      ]
    };

    res.status(500).json(errorResponse);
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Cannot ${req.method} ${req.path}`,
    availableEndpoints: {
      health: 'GET /health',
      scan: 'POST /api/v1/scan_transaction'
    }
  });
});

/**
 * Determine the primary attack type based on detection results
 */
function determineAttackType(sandwichRisk, frontRunRisk, copycatRisk) {
  if (copycatRisk.detected) {
    return 'copycat-frontrun';
  }

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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 MEV Protection Scanner Server started');
  console.log('📡 Server running on port', PORT);
  console.log('🏥 Health check: http://localhost:' + PORT + '/health');
  console.log('🔍 Scan endpoint: POST http://localhost:' + PORT + '/api/v1/scan_transaction');
  console.log('💰 Payment: $0.10 per scan (USDC on Base)');
  console.log('');
  console.log('Ready to protect transactions from MEV attacks! 🛡️');
});

export default app;
