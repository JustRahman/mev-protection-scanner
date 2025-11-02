import { calculatePriceImpact, estimateSandwichProfit } from '../utils/calculations.js';

/**
 * Detect sandwich attacks by analyzing mempool transactions
 *
 * A sandwich attack consists of:
 * 1. Front-run transaction (higher gas, same token pair)
 * 2. Victim transaction (user's transaction)
 * 3. Back-run transaction (lower gas, opposite direction)
 *
 * @param {object} userTx - User's transaction details
 * @param {object} mempoolData - Mempool data with competing transactions
 * @returns {object} Detection result with risk score and details
 */
export function detectSandwich(userTx, mempoolData) {
  const { competingTxs } = mempoolData;
  const userAmount = parseFloat(userTx.amount_in);
  const userGasPrice = calculateUserGasPrice(userTx, mempoolData);
  const tokenPair = `${userTx.token_in}/${userTx.token_out}`;

  // Filter transactions with same token pair
  const samePairTxs = competingTxs.filter(tx =>
    tx.tokenPair === tokenPair ||
    tx.tokenPair === `${userTx.token_out}/${userTx.token_in}` // Reverse pair
  );

  if (samePairTxs.length === 0) {
    return {
      risk: 'low',
      score: 10,
      type: 'none',
      confidence: 0.9,
      details: {
        frontRunners: [],
        backRunners: [],
        sandwichPairs: []
      }
    };
  }

  // Identify potential front-runners (higher gas, same direction)
  const frontRunners = samePairTxs.filter(tx =>
    tx.gasPrice > userGasPrice * 1.05 && // At least 5% higher gas
    tx.tokenPair === tokenPair // Same direction
  );

  // Identify potential back-runners (lower gas, opposite direction)
  const backRunners = samePairTxs.filter(tx =>
    tx.gasPrice < userGasPrice * 0.95 && // At least 5% lower gas
    tx.tokenPair === `${userTx.token_out}/${userTx.token_in}` // Opposite direction
  );

  // Check for sandwich pattern: both front and back runners exist
  if (frontRunners.length > 0 && backRunners.length > 0) {
    // High probability of sandwich attack
    const priceImpact = calculatePriceImpact(userAmount);
    const attackerProfit = estimateSandwichProfit(userAmount, priceImpact);

    // Calculate risk score based on multiple factors
    let riskScore = 70; // Base score for sandwich pattern

    // Increase score based on number of attackers
    riskScore += Math.min(frontRunners.length * 5, 15);

    // Increase score based on trade size (larger = more attractive)
    if (userAmount > 10000) riskScore += 5;
    if (userAmount > 50000) riskScore += 5;

    // Increase score based on price impact
    if (priceImpact > 1) riskScore += 5;
    if (priceImpact > 2) riskScore += 5;

    return {
      risk: riskScore >= 85 ? 'critical' : 'high',
      score: Math.min(riskScore, 100),
      type: 'sandwich',
      confidence: 0.85,
      details: {
        frontRunners: frontRunners.map(tx => ({
          hash: tx.hash,
          gasPrice: tx.gasPrice,
          amount: tx.amount
        })),
        backRunners: backRunners.map(tx => ({
          hash: tx.hash,
          gasPrice: tx.gasPrice,
          amount: tx.amount
        })),
        priceImpact,
        estimatedAttackerProfit: attackerProfit.toFixed(2),
        sandwichPairs: frontRunners.length
      }
    };
  }

  // Only front-runners detected (potential front-run, not full sandwich)
  if (frontRunners.length > 0) {
    return {
      risk: 'medium',
      score: 50 + (frontRunners.length * 5),
      type: 'potential-sandwich',
      confidence: 0.6,
      details: {
        frontRunners: frontRunners.map(tx => ({
          hash: tx.hash,
          gasPrice: tx.gasPrice,
          amount: tx.amount
        })),
        backRunners: [],
        sandwichPairs: 0,
        note: 'Front-runners detected but no back-runners yet'
      }
    };
  }

  // No clear sandwich pattern
  return {
    risk: 'low',
    score: 20 + (samePairTxs.length * 3),
    type: 'none',
    confidence: 0.7,
    details: {
      frontRunners: [],
      backRunners: [],
      sandwichPairs: 0,
      competingTransactions: samePairTxs.length
    }
  };
}

/**
 * Calculate user's gas price based on percentile
 * If not provided, assume median (50th percentile)
 */
function calculateUserGasPrice(userTx, mempoolData) {
  if (userTx.gasPrice) {
    return parseFloat(userTx.gasPrice);
  }

  // Use median gas price as default
  return parseFloat(mempoolData.gasPercentiles.p50);
}

/**
 * Analyze historical sandwich attacks for this token pair
 * to improve detection accuracy
 */
export function analyzeSandwichHistory(tokenPair, historicalAttacks) {
  if (!historicalAttacks || historicalAttacks.length === 0) {
    return {
      isHighRiskPair: false,
      attackFrequency: 0,
      averageProfit: 0
    };
  }

  const pairAttacks = historicalAttacks.filter(
    attack => attack.token_pair === tokenPair && attack.attack_type === 'sandwich'
  );

  if (pairAttacks.length === 0) {
    return {
      isHighRiskPair: false,
      attackFrequency: 0,
      averageProfit: 0
    };
  }

  const averageProfit = pairAttacks.reduce((sum, attack) => sum + attack.profit_usd, 0) / pairAttacks.length;
  const attackFrequency = pairAttacks.length;

  return {
    isHighRiskPair: attackFrequency > 10,
    attackFrequency,
    averageProfit: averageProfit.toFixed(2),
    recommendation: attackFrequency > 10
      ? 'This token pair is frequently targeted by sandwich attacks'
      : 'Low historical sandwich attack activity for this pair'
  };
}
