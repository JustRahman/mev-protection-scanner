/**
 * Calculate gas price percentile
 * @param {number} userGasPrice - User's gas price in gwei
 * @param {object} gasPercentiles - Gas price percentiles from mempool
 * @returns {number} Percentile (0-100)
 */
export function calculateGasPercentile(userGasPrice, gasPercentiles) {
  const { p25, p50, p75, p90 } = gasPercentiles;

  const p25Val = parseFloat(p25);
  const p50Val = parseFloat(p50);
  const p75Val = parseFloat(p75);
  const p90Val = parseFloat(p90);

  if (userGasPrice < p25Val) return 15;
  if (userGasPrice < p50Val) return 35;
  if (userGasPrice < p75Val) return 60;
  if (userGasPrice < p90Val) return 80;
  return 95;
}

/**
 * Determine mempool position based on gas price
 * @param {number} percentile - Gas price percentile
 * @returns {string} Position: 'front' | 'middle' | 'back'
 */
export function getMempoolPosition(percentile) {
  if (percentile >= 75) return 'front';
  if (percentile >= 40) return 'middle';
  return 'back';
}

/**
 * Calculate optimal gas price to avoid MEV
 * @param {object} gasPercentiles - Current gas price percentiles
 * @param {string} attackType - Type of MEV attack detected
 * @returns {object} Recommended gas price and strategy
 */
export function calculateOptimalGasPrice(gasPercentiles, attackType) {
  const p90 = parseFloat(gasPercentiles.p90);
  const p75 = parseFloat(gasPercentiles.p75);

  if (attackType === 'sandwich' || attackType === 'front-run') {
    // Recommend high gas to reduce risk
    return {
      recommended: Math.ceil(p90 * 1.1), // 10% above 90th percentile
      strategy: 'aggressive',
      description: 'High gas price to front-run potential attackers'
    };
  }

  // For lower risk, use median gas
  return {
    recommended: Math.ceil(p75),
    strategy: 'normal',
    description: 'Normal gas price for current network conditions'
  };
}

/**
 * Estimate gas cost in USD
 * @param {number} gasPrice - Gas price in gwei
 * @param {number} gasLimit - Estimated gas limit
 * @param {number} ethPriceUsd - Current ETH price in USD
 * @returns {number} Cost in USD
 */
export function estimateGasCostUsd(gasPrice, gasLimit = 150000, ethPriceUsd = 2000) {
  const gasCostEth = (gasPrice * gasLimit) / 1e9; // Convert from gwei to ETH
  return gasCostEth * ethPriceUsd;
}
