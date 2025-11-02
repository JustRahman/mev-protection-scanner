/**
 * Detect front-running attacks by analyzing gas prices and transaction timing
 *
 * Front-running occurs when an attacker:
 * 1. Observes a pending transaction
 * 2. Submits a similar transaction with higher gas
 * 3. Gets their transaction executed first
 *
 * @param {object} userTx - User's transaction details
 * @param {object} mempoolData - Mempool data with competing transactions
 * @returns {object} Detection result with risk score and details
 */
export function detectFrontRun(userTx, mempoolData) {
  const { competingTxs } = mempoolData;
  const userGasPrice = getUserGasPrice(userTx, mempoolData);
  const tokenPair = `${userTx.token_in}/${userTx.token_out}`;

  // Filter for same token pair and same direction
  const similarTxs = competingTxs.filter(tx =>
    tx.tokenPair === tokenPair
  );

  if (similarTxs.length === 0) {
    return {
      risk: 'low',
      score: 5,
      type: 'none',
      confidence: 0.9,
      details: {
        competitors: 0,
        highGasCompetitors: 0
      }
    };
  }

  // Find transactions with significantly higher gas (potential front-runners)
  const highGasCompetitors = similarTxs.filter(tx =>
    tx.gasPrice > userGasPrice * 1.1 // 10% or more higher gas
  );

  const veryHighGasCompetitors = similarTxs.filter(tx =>
    tx.gasPrice > userGasPrice * 1.25 // 25% or more higher gas
  );

  // Calculate risk score
  let riskScore = 0;

  if (veryHighGasCompetitors.length > 0) {
    // Critical risk: competitors with much higher gas
    riskScore = 70 + (veryHighGasCompetitors.length * 5);
  } else if (highGasCompetitors.length > 0) {
    // Medium-high risk: competitors with moderately higher gas
    riskScore = 50 + (highGasCompetitors.length * 5);
  } else if (similarTxs.length > 0) {
    // Low-medium risk: competitors with similar gas
    riskScore = 20 + (similarTxs.length * 3);
  }

  // Cap at 100
  riskScore = Math.min(riskScore, 100);

  // Determine risk level and attack type
  let risk, attackType, confidence;

  if (veryHighGasCompetitors.length > 0) {
    risk = riskScore >= 85 ? 'critical' : 'high';
    attackType = 'front-run';
    confidence = 0.75;
  } else if (highGasCompetitors.length > 0) {
    risk = 'medium';
    attackType = 'front-run';
    confidence = 0.6;
  } else {
    risk = 'low';
    attackType = 'none';
    confidence = 0.8;
  }

  return {
    risk,
    score: riskScore,
    type: attackType,
    confidence,
    details: {
      competitors: similarTxs.length,
      highGasCompetitors: highGasCompetitors.length,
      veryHighGasCompetitors: veryHighGasCompetitors.length,
      competitorGasPrices: highGasCompetitors.map(tx => tx.gasPrice),
      userGasPrice,
      gasGap: highGasCompetitors.length > 0
        ? ((Math.max(...highGasCompetitors.map(tx => tx.gasPrice)) - userGasPrice) / userGasPrice * 100).toFixed(1) + '%'
        : '0%'
    }
  };
}

/**
 * Get user's gas price, either from input or estimated from percentile
 */
function getUserGasPrice(userTx, mempoolData) {
  if (userTx.gasPrice) {
    return parseFloat(userTx.gasPrice);
  }

  // If user didn't specify gas price, assume they're using median
  return parseFloat(mempoolData.gasPercentiles.p50);
}

/**
 * Detect copycat transactions (exact copies with higher gas)
 * This is a specific type of front-running
 */
export function detectCopycat(userTx, mempoolData) {
  const { competingTxs } = mempoolData;
  const userAmount = parseFloat(userTx.amount_in);
  const userGasPrice = getUserGasPrice(userTx, mempoolData);
  const tokenPair = `${userTx.token_in}/${userTx.token_out}`;

  // Find transactions that are very similar in amount and token pair
  const copycatTxs = competingTxs.filter(tx => {
    const amountSimilarity = Math.abs(tx.amount - userAmount) / userAmount;
    return (
      tx.tokenPair === tokenPair &&
      amountSimilarity < 0.1 && // Within 10% of user's amount
      tx.gasPrice > userGasPrice * 1.05 // Higher gas
    );
  });

  if (copycatTxs.length > 0) {
    return {
      detected: true,
      count: copycatTxs.length,
      riskIncrease: 20, // Add 20 points to risk score
      warning: 'Potential copycat transactions detected - exact copies with higher gas',
      copycats: copycatTxs.map(tx => ({
        hash: tx.hash,
        amount: tx.amount,
        gasPrice: tx.gasPrice
      }))
    };
  }

  return {
    detected: false,
    count: 0,
    riskIncrease: 0
  };
}

/**
 * Analyze historical front-running attacks
 */
export function analyzeFrontRunHistory(tokenPair, historicalAttacks) {
  if (!historicalAttacks || historicalAttacks.length === 0) {
    return {
      isHighRiskPair: false,
      attackFrequency: 0
    };
  }

  const frontRunAttacks = historicalAttacks.filter(
    attack => attack.token_pair === tokenPair && attack.attack_type === 'front-run'
  );

  return {
    isHighRiskPair: frontRunAttacks.length > 5,
    attackFrequency: frontRunAttacks.length,
    recommendation: frontRunAttacks.length > 5
      ? 'This token pair has high front-running activity'
      : 'Normal front-running activity for this pair'
  };
}
