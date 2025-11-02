import { getAttacksByTokenPair, checkIfKnownAttacker, getRecentAttacks } from '../database/queries.js';

/**
 * Analyze historical MEV attack patterns for a token pair
 * @param {string} tokenPair - Token pair (e.g., "USDC/ETH")
 * @param {object} userTx - User's transaction details
 * @returns {object} Historical analysis results
 */
export function analyzeHistoricalPatterns(tokenPair, userTx) {
  try {
    // Get historical attacks for this token pair
    const historicalAttacks = getAttacksByTokenPair(tokenPair, 100);

    // Get recent attacks (last 24 hours)
    const recentAttacks = getRecentAttacks(24);

    // Calculate attack frequency
    const totalAttacks = historicalAttacks.length;
    const recentAttackCount = recentAttacks.filter(
      attack => attack.token_pair === tokenPair
    ).length;

    // Analyze attack types
    const attackTypes = historicalAttacks.reduce((acc, attack) => {
      acc[attack.attack_type] = (acc[attack.attack_type] || 0) + 1;
      return acc;
    }, {});

    // Calculate average profit
    const totalProfit = historicalAttacks.reduce((sum, attack) => sum + attack.profit_usd, 0);
    const avgProfit = totalAttacks > 0 ? totalProfit / totalAttacks : 0;

    // Determine risk level based on historical data
    let historicalRiskScore = 0;

    // High frequency of attacks
    if (totalAttacks > 50) historicalRiskScore += 15;
    else if (totalAttacks > 20) historicalRiskScore += 10;
    else if (totalAttacks > 10) historicalRiskScore += 5;

    // Recent activity
    if (recentAttackCount > 5) historicalRiskScore += 15;
    else if (recentAttackCount > 2) historicalRiskScore += 10;
    else if (recentAttackCount > 0) historicalRiskScore += 5;

    // High average profit (attracts more attackers)
    if (avgProfit > 100) historicalRiskScore += 10;
    else if (avgProfit > 50) historicalRiskScore += 5;

    return {
      riskScore: historicalRiskScore,
      totalAttacks,
      recentAttacks: recentAttackCount,
      attackTypes,
      avgProfit: avgProfit.toFixed(2),
      isHighRiskPair: totalAttacks > 20 || recentAttackCount > 3,
      recommendation: generateHistoricalRecommendation(totalAttacks, recentAttackCount, avgProfit)
    };
  } catch (error) {
    console.error('Error analyzing historical patterns:', error);
    // Return safe defaults if database query fails
    return {
      riskScore: 0,
      totalAttacks: 0,
      recentAttacks: 0,
      attackTypes: {},
      avgProfit: '0',
      isHighRiskPair: false,
      recommendation: 'No historical data available'
    };
  }
}

/**
 * Check if any addresses involved are known MEV bots
 * @param {string} walletAddress - User's wallet address
 * @returns {object} Known attacker analysis
 */
export function checkKnownAttackers(walletAddress) {
  try {
    if (!walletAddress) {
      return {
        isKnownAttacker: false,
        riskIncrease: 0
      };
    }

    const isKnown = checkIfKnownAttacker(walletAddress);

    if (isKnown) {
      return {
        isKnownAttacker: true,
        riskIncrease: 30,
        warning: 'WARNING: This address has been involved in previous MEV attacks'
      };
    }

    return {
      isKnownAttacker: false,
      riskIncrease: 0
    };
  } catch (error) {
    console.error('Error checking known attackers:', error);
    return {
      isKnownAttacker: false,
      riskIncrease: 0
    };
  }
}

/**
 * Analyze time-based patterns (certain times are more risky)
 * @returns {object} Time-based risk analysis
 */
export function analyzeTimingPatterns() {
  const hour = new Date().getUTCHours();

  // Peak hours (high activity = more MEV)
  // 12-18 UTC is typically high volume (US/Europe overlap)
  const isPeakHour = hour >= 12 && hour <= 18;

  // Weekend (lower liquidity = higher risk)
  const day = new Date().getUTCDay();
  const isWeekend = day === 0 || day === 6;

  let timingRiskScore = 0;

  if (isPeakHour) {
    timingRiskScore += 5;
  }

  if (isWeekend) {
    timingRiskScore += 3;
  }

  return {
    riskScore: timingRiskScore,
    isPeakHour,
    isWeekend,
    recommendation: isPeakHour
      ? 'High trading volume period - more MEV bot activity'
      : 'Normal trading period'
  };
}

/**
 * Generate recommendation based on historical data
 */
function generateHistoricalRecommendation(totalAttacks, recentAttacks, avgProfit) {
  if (totalAttacks > 50 || recentAttacks > 5) {
    return '⚠️ This token pair is frequently targeted by MEV bots. Use private RPC or split trades.';
  }

  if (totalAttacks > 20 || recentAttacks > 2) {
    return 'Moderate MEV activity detected. Consider increasing slippage tolerance.';
  }

  if (totalAttacks > 10 || recentAttacks > 0) {
    return 'Some MEV activity detected. Monitor your transaction closely.';
  }

  return 'Low historical MEV activity for this token pair.';
}

/**
 * Get similar historical attacks for comparison
 * @param {string} tokenPair - Token pair
 * @param {number} amount - Trade amount
 * @returns {array} Similar attacks
 */
export function getSimilarAttacks(tokenPair, amount) {
  try {
    const attacks = getAttacksByTokenPair(tokenPair, 1000);

    // Filter for similar trade sizes (within 50% of user's amount)
    const similarAttacks = attacks.filter(attack => {
      // We don't store victim amounts in this schema, so we'll return all attacks for now
      // In production, enhance the schema to include more transaction details
      return true;
    });

    return similarAttacks.slice(0, 20); // Return top 20 most recent
  } catch (error) {
    console.error('Error getting similar attacks:', error);
    return [];
  }
}

/**
 * Combined historical analysis
 * @param {object} input - Transaction input
 * @returns {object} Complete historical analysis
 */
export function performHistoricalAnalysis(input) {
  const tokenPair = `${input.token_in}/${input.token_out}`;
  const amount = parseFloat(input.amount_in);

  // Get all historical analyses
  const patternAnalysis = analyzeHistoricalPatterns(tokenPair, input);
  const attackerCheck = checkKnownAttackers(input.wallet_address);
  const timingAnalysis = analyzeTimingPatterns();
  const similarAttacks = getSimilarAttacks(tokenPair, amount);

  // Combine risk scores
  const totalHistoricalRisk =
    patternAnalysis.riskScore +
    attackerCheck.riskIncrease +
    timingAnalysis.riskScore;

  return {
    riskScore: Math.min(totalHistoricalRisk, 40), // Cap historical contribution at 40 points
    patternAnalysis,
    attackerCheck,
    timingAnalysis,
    similarAttacksFound: similarAttacks.length,
    similarAttacks: similarAttacks.slice(0, 5) // Return top 5 for details
  };
}
