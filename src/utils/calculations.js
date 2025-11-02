/**
 * Calculate potential loss from MEV attack
 * @param {object} input - Transaction input parameters
 * @param {number} riskScore - Calculated risk score (0-100)
 * @returns {number} Estimated loss in USD
 */
export function calculatePotentialLoss(input, riskScore) {
  const amountIn = parseFloat(input.amount_in);

  // Base slippage loss estimate (0.5% for low risk, up to 5% for critical)
  const slippageMultiplier = riskScore / 100;
  const maxSlippage = 0.05; // 5% maximum

  const estimatedSlippage = maxSlippage * slippageMultiplier;
  const loss = amountIn * estimatedSlippage;

  return parseFloat(loss.toFixed(2));
}

/**
 * Calculate price impact for a trade
 * @param {number} amountIn - Amount being traded
 * @param {number} liquidityPool - Total liquidity in pool
 * @returns {number} Price impact percentage
 */
export function calculatePriceImpact(amountIn, liquidityPool = 1000000) {
  // Simplified constant product formula: x * y = k
  // Price impact = (amountIn / liquidity) * 100
  const impact = (amountIn / liquidityPool) * 100;

  // Cap at 100%
  return Math.min(impact, 100);
}

/**
 * Estimate sandwich attack profit potential
 * @param {number} victimAmount - Victim's trade amount
 * @param {number} priceImpact - Price impact of victim's trade
 * @returns {number} Estimated profit for attacker in USD
 */
export function estimateSandwichProfit(victimAmount, priceImpact) {
  // Attacker profits from price movement
  // Simplified: profit = victimAmount * priceImpact * 0.8 (80% capture rate)
  const captureRate = 0.8;
  return victimAmount * (priceImpact / 100) * captureRate;
}

/**
 * Calculate risk level from risk score
 * @param {number} riskScore - Risk score (0-100)
 * @returns {string} Risk level: 'low' | 'medium' | 'high' | 'critical'
 */
export function getRiskLevel(riskScore) {
  if (riskScore >= 85) return 'critical';
  if (riskScore >= 70) return 'high';
  if (riskScore >= 40) return 'medium';
  return 'low';
}

/**
 * Calculate optimal trade split to reduce MEV risk
 * @param {number} totalAmount - Total amount to trade
 * @param {number} riskScore - Current risk score
 * @returns {object} Trade splitting recommendation
 */
export function calculateOptimalSplit(totalAmount, riskScore) {
  if (riskScore < 50) {
    return {
      splits: 1,
      amountPerSplit: totalAmount,
      recommendation: 'Trade in single transaction'
    };
  }

  if (riskScore < 70) {
    return {
      splits: 2,
      amountPerSplit: totalAmount / 2,
      recommendation: 'Split into 2 transactions'
    };
  }

  if (riskScore < 85) {
    return {
      splits: 3,
      amountPerSplit: totalAmount / 3,
      recommendation: 'Split into 3 transactions'
    };
  }

  return {
    splits: 5,
    amountPerSplit: totalAmount / 5,
    recommendation: 'Split into 5 smaller transactions for maximum protection'
  };
}

/**
 * Calculate expected execution time
 * @param {number} blockTimeEstimate - Average block time in seconds
 * @param {number} gasPercentile - User's gas price percentile
 * @returns {number} Estimated blocks until execution
 */
export function calculateExpectedExecutionTime(blockTimeEstimate, gasPercentile) {
  // Higher gas percentile = faster execution
  if (gasPercentile >= 90) return blockTimeEstimate; // Next block
  if (gasPercentile >= 70) return blockTimeEstimate * 2; // 1-2 blocks
  if (gasPercentile >= 50) return blockTimeEstimate * 3; // 2-3 blocks
  return blockTimeEstimate * 5; // 4-5 blocks
}
