import express from 'express';
import dotenv from 'dotenv';
import { z } from 'zod';
import fetch from 'node-fetch';

// Import ENHANCED services with real blockchain data
import { getRealMempoolData, getGasPrice, getWebSocketStatus, initWebSocketMempoolService } from './src/services/mempool-enhanced.js';
import { getPoolData, calculatePriceImpact, getAggregatedLiquidity } from './src/services/dex-pools.js';
import { analyzeMEVPatterns, analyzeMempoolCongestion } from './src/services/pattern-analyzer.js';

// Import original services (fallback)
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

// Initialize WebSocket mempool (AFTER dotenv loads!)
console.log('🔌 Initializing WebSocket mempool service...');
initWebSocketMempoolService();

const app = express();
app.use(express.json());

// Enable detailed logging
const VERBOSE = process.env.VERBOSE === 'true';

// X402 Payment Configuration
const PAYMENT_CONFIG = {
  wallet: process.env.PAY_TO_WALLET,
  facilitator: process.env.FACILITATOR_URL,
  network: process.env.PAYMENT_NETWORK || 'base',
  amount: process.env.PAYMENT_AMOUNT || '0.10',
  currency: process.env.PAYMENT_CURRENCY || 'USDC'
};

// X402 standard response format (matching bridge-route-pinger format)
function getX402Response(req) {
  // Build full resource URL dynamically from request
  const resourceUrl = `${req.protocol}://${req.get('host')}${req.path}`;

  return {
    error: 'X-PAYMENT header is required',
    accepts: [
      {
        scheme: 'exact',
        network: PAYMENT_CONFIG.network,
        maxAmountRequired: '100000', // 0.10 USDC (6 decimals)
        resource: resourceUrl, // Full URL: http://localhost:3000/api/v1/scan_transaction
        description: 'MEV Protection Scanner - Detect sandwich attacks and front-running',
        mimeType: 'application/json',
        payTo: PAYMENT_CONFIG.wallet,
        maxTimeoutSeconds: 300,
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // USDC contract on Base
      }
    ],
    x402Version: 1 // Number, not string
  };
}

/**
 * X402 Payment Verification Middleware
 * Verifies payment header with facilitator before allowing access
 */
async function verifyX402Payment(req, res, next) {
  const paymentHeader = req.headers['x-payment'];

  // Check if payment header exists
  if (!paymentHeader) {
    console.log('❌ Payment required - No X-PAYMENT header found');
    return res.status(402).json(getX402Response(req));
  }

  // Verify payment with facilitator
  try {
    console.log('🔍 Verifying payment with facilitator...');
    console.log('   Payment header:', paymentHeader.substring(0, 50) + '...');
    const verifyUrl = `${PAYMENT_CONFIG.facilitator}/verify`;
    console.log('   Facilitator URL:', verifyUrl);

    // Facilitator only needs the payment header, not additional metadata
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': paymentHeader
      }
    });

    console.log('   Facilitator response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Payment verification failed:', response.status);
      console.log('   Error response:', errorText);
      return res.status(402).json(getX402Response(req));
    }

    const verificationResult = await response.json();

    if (!verificationResult.valid) {
      console.log('❌ Invalid payment:', verificationResult.message);
      return res.status(402).json(getX402Response(req));
    }

    console.log('✅ Payment verified successfully');
    next();

  } catch (error) {
    console.error('❌ Payment verification error:', error.message);
    return res.status(402).json(getX402Response(req));
  }
}

// Request validation schema
const scanRequestSchema = z.object({
  transaction_hash: z.string().optional(),
  wallet_address: z.string().optional(),
  token_in: z.string().min(1),
  token_out: z.string().min(1),
  amount_in: z.string().min(1),
  gas_price: z.string().optional(),
  dex: z.enum(['uniswap-v2', 'uniswap-v3', 'sushiswap', 'curve', 'balancer']),
  use_real_data: z.boolean().optional().default(true)
});

// Health check endpoint
app.get('/health', (req, res) => {
  const wsStatus = getWebSocketStatus();

  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: Date.now(),
    version: '2.0.0-enhanced',
    features: {
      realMempoolData: wsStatus.isConnected, // TRUE WHEN WEBSOCKET CONNECTED!
      mempoolSource: wsStatus.source, // infura or blocknative
      blocknativeIntegration: !!process.env.BLOCKNATIVE_API_KEY,
      dexPoolData: true,
      patternAnalysis: true
    },
    websocket: {
      connected: wsStatus.isConnected,
      source: wsStatus.source,
      cachedTransactions: wsStatus.cachedTransactions,
      cacheAgeSeconds: Math.round(wsStatus.cacheAge / 1000)
    }
  });
});

// Gas price oracle endpoint
app.get('/api/v1/gas_price', async (req, res) => {
  try {
    const gasPriceData = await getGasPrice();
    res.json(gasPriceData);
  } catch (error) {
    console.error('❌ Gas price fetch failed:', error);
    res.status(500).json({ error: 'Failed to fetch gas prices' });
  }
});

// Pool data endpoint
app.get('/api/v1/pool/:tokenIn/:tokenOut', async (req, res) => {
  try {
    const { tokenIn, tokenOut } = req.params;
    const dex = req.query.dex || 'uniswap-v2';

    const poolData = await getPoolData(tokenIn, tokenOut, dex);
    res.json(poolData);
  } catch (error) {
    console.error('❌ Pool data fetch failed:', error);
    res.status(500).json({ error: 'Failed to fetch pool data' });
  }
});

// ENHANCED Main scan endpoint with real blockchain data (X402 Payment Required)
app.post('/api/v1/scan_transaction', verifyX402Payment, async (req, res) => {
  const startTime = Date.now();

  try {
    // Validate input
    const input = scanRequestSchema.parse(req.body);
    console.log('🔍 Starting ENHANCED MEV scan for:', input);

    // ===========================================
    // STEP 1: Fetch REAL mempool data
    // ===========================================
    console.log('📊 Fetching REAL mempool data from blockchain...');
    const userTxDetails = {
      gasPrice: input.gas_price,
      amount: input.amount_in
    };

    const mempoolData = input.use_real_data
      ? await getRealMempoolData(input.token_in, input.token_out, userTxDetails)
      : await getMempoolData(input.token_in, input.token_out); // Fallback to simulated

    console.log(`📡 Data source: ${mempoolData.dataSource || 'simulated'}`);
    console.log(`📈 Confidence: ${(mempoolData.confidence * 100).toFixed(0)}%`);

    // ===========================================
    // STEP 2: Fetch REAL DEX pool data
    // ===========================================
    console.log('🏊 Fetching DEX pool data...');
    const poolData = await getPoolData(input.token_in, input.token_out, input.dex);

    console.log(`💰 Pool liquidity: $${poolData.liquidity?.toLocaleString() || 'N/A'}`);

    // Calculate price impact
    const priceImpact = calculatePriceImpact(poolData, input.amount_in, input.token_in);
    console.log(`📊 Price impact: ${priceImpact.priceImpact}%`);

    // ===========================================
    // STEP 3: Advanced pattern analysis
    // ===========================================
    console.log('🎯 Running ADVANCED pattern analysis...');
    const patternAnalysis = analyzeMEVPatterns(mempoolData, input);

    console.log(`🚨 Patterns detected:`);
    if (patternAnalysis.patterns.sandwich.detected) {
      console.log(`  - Sandwich: ${(patternAnalysis.patterns.sandwich.confidence * 100).toFixed(0)}% confidence`);
    }
    if (patternAnalysis.patterns.frontrun.detected) {
      console.log(`  - Front-run: ${(patternAnalysis.patterns.frontrun.confidence * 100).toFixed(0)}% confidence`);
    }
    if (patternAnalysis.patterns.copycat.detected) {
      console.log(`  - Copycat: ${patternAnalysis.patterns.copycat.count} detected`);
    }

    // Analyze mempool congestion
    const congestionAnalysis = analyzeMempoolCongestion(mempoolData);
    console.log(`📊 Mempool congestion: ${congestionAnalysis.congestionLevel}`);

    // ===========================================
    // STEP 4: Run original detectors (for comparison)
    // ===========================================
    console.log('🔧 Running legacy detection algorithms...');

    const sandwichRisk = detectSandwich(input, mempoolData);
    const frontRunRisk = detectFrontRun(input, mempoolData);
    const copycatRisk = detectCopycat(input, mempoolData);
    const historicalAnalysis = performHistoricalAnalysis(input);

    // ===========================================
    // STEP 5: Calculate comprehensive risk score
    // ===========================================
    console.log('📈 Calculating comprehensive risk score...');

    // Combine pattern analysis with legacy detectors
    const patternRiskScore = patternAnalysis.aggregateRisk;
    const legacyRiskScore = Math.max(
      sandwichRisk.score * 0.45 +
      frontRunRisk.score * 0.35 +
      historicalAnalysis.riskScore * 0.20
    );

    // Use weighted average (60% pattern analysis, 40% legacy)
    const combinedRisk = (patternRiskScore * 0.6) + (legacyRiskScore * 0.4);

    // Add price impact risk
    const priceImpactRisk = parseFloat(priceImpact.priceImpact) > 2 ? 10 : 0;

    // Add congestion risk
    const congestionRisk = congestionAnalysis.congestionScore * 0.1;

    // Final risk score
    const riskScore = Math.min(
      Math.round(combinedRisk + priceImpactRisk + congestionRisk),
      100
    );

    // Determine primary attack type
    const attackType = determineAttackType(
      patternAnalysis.patterns,
      sandwichRisk,
      frontRunRisk,
      copycatRisk
    );

    console.log('📈 Final risk score:', riskScore, '| Attack type:', attackType);

    // ===========================================
    // STEP 6: Generate comprehensive protection recommendations
    // ===========================================
    console.log('🛡️  Generating protection recommendations...');

    // Combine pattern-based recommendations with legacy suggestions
    const protectionSuggestions = [
      ...patternAnalysis.recommendations.map(r =>
        `${getEmojiForType(r.type)} ${r.type}: ${r.title} - ${r.action}`
      ),
      ...formatSuggestionsForOutput(
        generateProtectionSuggestions(riskScore, attackType, mempoolData, input)
      )
    ];

    // Add DEX-specific recommendations
    const dexRecommendations = getDexSpecificRecommendations(input.dex, riskScore);
    protectionSuggestions.push(...formatSuggestionsForOutput(dexRecommendations));

    // Add congestion-based recommendations
    if (congestionAnalysis.congestionLevel !== 'low') {
      protectionSuggestions.push(`⏰ ${congestionAnalysis.congestionLevel.toUpperCase()}: ${congestionAnalysis.recommendation}`);
    }

    // Add price impact warnings
    if (parseFloat(priceImpact.priceImpact) > 2) {
      protectionSuggestions.push(`⚠️ HIGH: High price impact (${priceImpact.priceImpact}%) - Consider splitting trade`);
    }

    // Remove duplicates
    const uniqueSuggestions = [...new Set(protectionSuggestions)];

    // ===========================================
    // STEP 7: Calculate potential loss
    // ===========================================
    const estimatedLoss = calculatePotentialLoss(input, riskScore);
    const riskLevel = getRiskLevel(riskScore);

    // ===========================================
    // STEP 8: Prepare comprehensive response
    // ===========================================
    const responseTime = Date.now() - startTime;

    const userGasPrice = parseFloat(input.gas_price || mempoolData.gasPercentiles.p50);
    const gasPercentile = calculateGasPercentile(userGasPrice, mempoolData.gasPercentiles);
    const mempoolPosition = getMempoolPosition(gasPercentile);

    const result = {
      risk_score: riskScore,
      attack_type: attackType,
      risk_level: riskLevel,
      estimated_loss_usd: estimatedLoss,
      similar_attacks_found: historicalAnalysis.similarAttacksFound || 0,
      protection_suggestions: uniqueSuggestions.slice(0, 10), // Top 10 suggestions

      // Enhanced details
      details: {
        mempool_position: mempoolPosition,
        gas_price_percentile: gasPercentile,
        competing_txs: mempoolData.competingTxs?.length || 0,
        block_time_estimate: mempoolData.blockTimeEstimate,
        detection_confidence: mempoolData.confidence || 0.5,
        response_time_ms: responseTime,
        data_source: mempoolData.dataSource,
        congestion_level: congestionAnalysis.congestionLevel,
        price_impact: priceImpact.priceImpact + '%'
      },

      // Pattern analysis results
      patterns: {
        sandwich: {
          detected: patternAnalysis.patterns.sandwich.detected,
          confidence: patternAnalysis.patterns.sandwich.confidence,
          front_runners: patternAnalysis.patterns.sandwich.frontRunners?.length || 0,
          back_runners: patternAnalysis.patterns.sandwich.backRunners?.length || 0,
          estimated_profit: patternAnalysis.patterns.sandwich.estimatedProfit
        },
        frontrun: {
          detected: patternAnalysis.patterns.frontrun.detected,
          confidence: patternAnalysis.patterns.frontrun.confidence,
          competitors: patternAnalysis.patterns.frontrun.competitorCount || 0,
          max_gas_premium: patternAnalysis.patterns.frontrun.maxGasPremium
        },
        copycat: {
          detected: patternAnalysis.patterns.copycat.detected,
          confidence: patternAnalysis.patterns.copycat.confidence,
          count: patternAnalysis.patterns.copycat.count
        },
        backrun: {
          detected: patternAnalysis.patterns.backrun.detected,
          confidence: patternAnalysis.patterns.backrun.confidence
        },
        jit_liquidity: {
          detected: patternAnalysis.patterns.jit.detected,
          confidence: patternAnalysis.patterns.jit.confidence
        }
      },

      // Pool data
      pool_data: {
        dex: poolData.dex,
        liquidity_usd: poolData.liquidity,
        reserve0: poolData.reserve0,
        reserve1: poolData.reserve1,
        price_impact: priceImpact.priceImpact,
        estimated_output: priceImpact.estimatedOutput,
        data_source: poolData.dataSource
      },

      // Legacy analysis (for backwards compatibility)
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
    console.log('✅ ENHANCED scan completed in', responseTime, 'ms');
    console.log(JSON.stringify({
      timestamp: Date.now(),
      event: 'enhanced_scan_completed',
      risk_score: riskScore,
      attack_type: attackType,
      response_time_ms: responseTime,
      token_pair: `${input.token_in}/${input.token_out}`,
      data_source: mempoolData.dataSource,
      confidence: mempoolData.confidence
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
      scan: 'POST /api/v1/scan_transaction',
      gasPrice: 'GET /api/v1/gas_price',
      poolData: 'GET /api/v1/pool/:tokenIn/:tokenOut?dex=uniswap-v2'
    }
  });
});

/**
 * Determine the primary attack type based on pattern analysis
 */
function determineAttackType(patterns, sandwichRisk, frontRunRisk, copycatRisk) {
  // Pattern analysis takes precedence
  if (patterns.sandwich.detected && patterns.sandwich.confidence > 0.7) {
    return 'sandwich';
  }

  if (patterns.copycat.detected && patterns.copycat.confidence > 0.7) {
    return 'copycat-frontrun';
  }

  if (patterns.frontrun.detected && patterns.frontrun.confidence > 0.6) {
    return 'front-run';
  }

  if (patterns.backrun.detected && patterns.backrun.confidence > 0.6) {
    return 'back-run';
  }

  if (patterns.jit.detected && patterns.jit.confidence > 0.6) {
    return 'jit-liquidity';
  }

  // Fallback to legacy detection
  if (copycatRisk.detected) {
    return 'copycat-frontrun';
  }

  if (sandwichRisk.score >= frontRunRisk.score * 0.9) {
    return sandwichRisk.type;
  }

  return frontRunRisk.type;
}

/**
 * Get emoji for recommendation type
 */
function getEmojiForType(type) {
  const emojis = {
    'CRITICAL': '🚨',
    'HIGH': '🔴',
    'MEDIUM': '🟡',
    'LOW': '🟢',
    'INFO': 'ℹ️'
  };
  return emojis[type] || '📌';
}

// Import fallback for getMempoolData (original)
import { getMempoolData } from './src/services/mempool.js';

// Start server
const PORT = process.env.PORT || 3001; // Use 3001 to avoid conflict
app.listen(PORT, () => {
  console.log('🚀 MEV Protection Scanner ENHANCED Server started');
  console.log('📡 Server running on port', PORT);
  console.log('🏥 Health check: http://localhost:' + PORT + '/health');
  console.log('🔍 Scan endpoint: POST http://localhost:' + PORT + '/api/v1/scan_transaction');
  console.log('⛽ Gas price: GET http://localhost:' + PORT + '/api/v1/gas_price');
  console.log('');
  console.log('✨ ENHANCED FEATURES:');
  console.log('  - Real blockchain mempool data');
  console.log('  - Live DEX pool analysis');
  console.log('  - Advanced pattern detection');
  console.log('  - Multi-source gas oracle');
  console.log('  - Mempool congestion analysis');
  console.log('');
  console.log('💰 X402 PAYMENT REQUIRED:');
  console.log(`  Amount: ${PAYMENT_CONFIG.amount} ${PAYMENT_CONFIG.currency}`);
  console.log(`  Network: ${PAYMENT_CONFIG.network}`);
  console.log(`  Wallet: ${PAYMENT_CONFIG.wallet}`);
  console.log(`  Facilitator: ${PAYMENT_CONFIG.facilitator}`);
  console.log('  Header: X-PAYMENT (required for /api/v1/scan_transaction)');
  console.log('');
  console.log('🆓 FREE ENDPOINTS:');
  console.log('  - GET /health');
  console.log('  - GET /api/v1/gas_price');
  console.log('');
  console.log('Ready to protect transactions from MEV attacks! 🛡️');
});

export default app;
