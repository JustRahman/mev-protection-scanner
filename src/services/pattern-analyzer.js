/**
 * Advanced Transaction Pattern Analyzer
 * Detects MEV attack patterns in real mempool data
 */

/**
 * Analyze mempool transactions for MEV attack patterns
 */
export function analyzeMEVPatterns(mempoolData, userTx) {
  const patterns = {
    sandwich: detectSandwichPattern(mempoolData, userTx),
    frontrun: detectFrontrunPattern(mempoolData, userTx),
    backrun: detectBackrunPattern(mempoolData, userTx),
    copycat: detectCopycatPattern(mempoolData, userTx),
    jit: detectJITLiquidityPattern(mempoolData, userTx)
  };

  // Calculate aggregate risk
  const aggregateRisk = calculateAggregateRisk(patterns);

  return {
    patterns,
    aggregateRisk,
    recommendations: generateRecommendations(patterns, aggregateRisk),
    timestamp: Math.floor(Date.now() / 1000)
  };
}

/**
 * Detect sandwich attack pattern
 * Pattern: Front-run -> User Tx -> Back-run
 */
function detectSandwichPattern(mempoolData, userTx) {
  const { competingTxs } = mempoolData;

  if (!competingTxs || competingTxs.length === 0) {
    return {
      detected: false,
      confidence: 0,
      details: null
    };
  }

  // Look for transactions with:
  // 1. Higher gas (potential front-run)
  // 2. Same token pair
  // 3. Lower gas following (potential back-run)

  const userGasPrice = parseFloat(userTx.gasPrice || mempoolData.gasPercentiles.p50);

  const frontRunners = competingTxs.filter(tx => {
    const txGasPrice = parseFloat(tx.gasPrice);
    return txGasPrice > userGasPrice * 1.05 && // 5% higher gas
           isSameOrRelatedPair(tx.tokenPair, `${userTx.token_in}/${userTx.token_out}`);
  });

  const backRunners = competingTxs.filter(tx => {
    const txGasPrice = parseFloat(tx.gasPrice);
    return txGasPrice < userGasPrice * 0.95 && // 5% lower gas
           isSameOrRelatedPair(tx.tokenPair, `${userTx.token_in}/${userTx.token_out}`) &&
           isOppositeDirection(tx, userTx);
  });

  const detected = frontRunners.length > 0 && backRunners.length > 0;

  // Calculate confidence based on pattern strength
  let confidence = 0;
  if (detected) {
    confidence = Math.min(
      0.6 + // Base confidence
      (frontRunners.length * 0.1) + // More front-runners = higher confidence
      (backRunners.length * 0.1) + // More back-runners = higher confidence
      (checkGasOrdering(frontRunners, backRunners, userGasPrice) ? 0.2 : 0), // Perfect ordering
      1.0
    );
  }

  return {
    detected,
    confidence,
    frontRunners: frontRunners.map(tx => ({
      hash: tx.hash,
      gasPrice: tx.gasPrice,
      gasDiff: ((parseFloat(tx.gasPrice) - userGasPrice) / userGasPrice * 100).toFixed(2)
    })),
    backRunners: backRunners.map(tx => ({
      hash: tx.hash,
      gasPrice: tx.gasPrice,
      gasDiff: ((userGasPrice - parseFloat(tx.gasPrice)) / userGasPrice * 100).toFixed(2)
    })),
    estimatedProfit: estimateSandwichProfit(userTx, frontRunners, backRunners)
  };
}

/**
 * Detect front-running pattern
 * Pattern: Competing transaction with higher gas
 */
function detectFrontrunPattern(mempoolData, userTx) {
  const { competingTxs } = mempoolData;

  if (!competingTxs || competingTxs.length === 0) {
    return {
      detected: false,
      confidence: 0,
      details: null
    };
  }

  const userGasPrice = parseFloat(userTx.gasPrice || mempoolData.gasPercentiles.p50);
  const tokenPair = `${userTx.token_in}/${userTx.token_out}`;

  // Find transactions with higher gas on same pair
  const competitors = competingTxs.filter(tx => {
    const txGasPrice = parseFloat(tx.gasPrice);
    return txGasPrice > userGasPrice &&
           isSameOrRelatedPair(tx.tokenPair, tokenPair);
  });

  const detected = competitors.length > 0;

  // Calculate confidence
  let confidence = 0;
  if (detected) {
    const maxGasDiff = Math.max(...competitors.map(tx =>
      (parseFloat(tx.gasPrice) - userGasPrice) / userGasPrice
    ));

    confidence = Math.min(
      0.5 + // Base confidence
      (competitors.length * 0.1) + // More competitors = higher risk
      (maxGasDiff * 0.3), // Higher gas difference = higher risk
      1.0
    );
  }

  return {
    detected,
    confidence,
    competitorCount: competitors.length,
    competitors: competitors.map(tx => ({
      hash: tx.hash,
      gasPrice: tx.gasPrice,
      gasPremium: ((parseFloat(tx.gasPrice) - userGasPrice) / userGasPrice * 100).toFixed(2)
    })),
    maxGasPremium: detected ? Math.max(...competitors.map(tx =>
      ((parseFloat(tx.gasPrice) - userGasPrice) / userGasPrice * 100)
    )).toFixed(2) : 0
  };
}

/**
 * Detect back-running pattern
 * Pattern: Transaction following user's tx to profit from price movement
 */
function detectBackrunPattern(mempoolData, userTx) {
  const { competingTxs } = mempoolData;

  if (!competingTxs || competingTxs.length === 0) {
    return {
      detected: false,
      confidence: 0,
      details: null
    };
  }

  const userGasPrice = parseFloat(userTx.gasPrice || mempoolData.gasPercentiles.p50);
  const tokenPair = `${userTx.token_in}/${userTx.token_out}`;

  // Look for transactions with:
  // 1. Slightly lower gas (to execute after user)
  // 2. Opposite direction (to profit from price movement)
  const backRunners = competingTxs.filter(tx => {
    const txGasPrice = parseFloat(tx.gasPrice);
    return txGasPrice < userGasPrice &&
           txGasPrice > userGasPrice * 0.8 && // Not too low
           isSameOrRelatedPair(tx.tokenPair, tokenPair) &&
           isOppositeDirection(tx, userTx);
  });

  const detected = backRunners.length > 0;

  let confidence = 0;
  if (detected) {
    confidence = Math.min(
      0.4 + // Base confidence (lower than front-run)
      (backRunners.length * 0.15) +
      (checkGasPositioning(backRunners, userGasPrice) ? 0.2 : 0),
      1.0
    );
  }

  return {
    detected,
    confidence,
    backRunners: backRunners.map(tx => ({
      hash: tx.hash,
      gasPrice: tx.gasPrice,
      direction: tx.tokenPair
    }))
  };
}

/**
 * Detect copycat transactions
 * Pattern: Identical or very similar transactions with higher gas
 */
function detectCopycatPattern(mempoolData, userTx) {
  const { competingTxs } = mempoolData;

  if (!competingTxs || competingTxs.length === 0) {
    return {
      detected: false,
      confidence: 0,
      count: 0
    };
  }

  const userGasPrice = parseFloat(userTx.gasPrice || mempoolData.gasPercentiles.p50);
  const userAmount = parseFloat(userTx.amount_in);

  // Find transactions with:
  // 1. Same token pair
  // 2. Similar amount (within 10%)
  // 3. Higher gas price
  const copycats = competingTxs.filter(tx => {
    const txGasPrice = parseFloat(tx.gasPrice);
    const isSamePair = tx.tokenPair === `${userTx.token_in}/${userTx.token_out}`;
    const isSimilarAmount = Math.abs(parseFloat(tx.value) - userAmount) / userAmount < 0.1;
    const isHigherGas = txGasPrice > userGasPrice;

    return isSamePair && isSimilarAmount && isHigherGas;
  });

  const detected = copycats.length > 0;

  return {
    detected,
    confidence: detected ? Math.min(0.7 + (copycats.length * 0.1), 1.0) : 0,
    count: copycats.length,
    copycats: copycats.map(tx => ({
      hash: tx.hash,
      gasPrice: tx.gasPrice,
      amount: tx.value
    }))
  };
}

/**
 * Detect JIT (Just-In-Time) liquidity attacks
 * Pattern: Large liquidity added right before user's tx
 */
function detectJITLiquidityPattern(mempoolData, userTx) {
  const { competingTxs } = mempoolData;

  if (!competingTxs || competingTxs.length === 0) {
    return {
      detected: false,
      confidence: 0,
      details: null
    };
  }

  // Look for addLiquidity transactions
  // This is a simplified check - would need full transaction decoding in production
  const liquidityTxs = competingTxs.filter(tx =>
    tx.input && (
      tx.input.startsWith('0xe8e33700') || // addLiquidity
      tx.input.startsWith('0xf305d719')    // addLiquidityETH
    )
  );

  const detected = liquidityTxs.length > 0;

  return {
    detected,
    confidence: detected ? 0.6 : 0,
    liquidityTxs: liquidityTxs.map(tx => ({
      hash: tx.hash,
      gasPrice: tx.gasPrice
    }))
  };
}

/**
 * Check if two token pairs are the same or related
 */
function isSameOrRelatedPair(pair1, pair2) {
  if (!pair1 || !pair2) return false;

  // Exact match
  if (pair1 === pair2) return true;

  // Reverse match (ETH/USDC vs USDC/ETH)
  const [t1a, t1b] = pair1.split('/');
  const [t2a, t2b] = pair2.split('/');
  if (t1a === t2b && t1b === t2a) return true;

  // Related if they share at least one token
  const tokens1 = pair1.split('/');
  const tokens2 = pair2.split('/');
  return tokens1.some(t => tokens2.includes(t));
}

/**
 * Check if transaction is in opposite direction
 */
function isOppositeDirection(tx, userTx) {
  if (!tx.tokenPair) return false;

  const [txIn, txOut] = tx.tokenPair.split('/');
  return (txIn === userTx.token_out && txOut === userTx.token_in);
}

/**
 * Check if gas prices are properly ordered for sandwich
 */
function checkGasOrdering(frontRunners, backRunners, userGasPrice) {
  if (frontRunners.length === 0 || backRunners.length === 0) return false;

  const avgFrontGas = frontRunners.reduce((sum, tx) => sum + parseFloat(tx.gasPrice), 0) / frontRunners.length;
  const avgBackGas = backRunners.reduce((sum, tx) => sum + parseFloat(tx.gasPrice), 0) / backRunners.length;

  return avgFrontGas > userGasPrice && userGasPrice > avgBackGas;
}

/**
 * Check if back-runners are positioned correctly
 */
function checkGasPositioning(backRunners, userGasPrice) {
  if (backRunners.length === 0) return false;

  const avgBackGas = backRunners.reduce((sum, tx) => sum + parseFloat(tx.gasPrice), 0) / backRunners.length;

  // Back-runners should have slightly lower gas
  return avgBackGas < userGasPrice && avgBackGas > userGasPrice * 0.85;
}

/**
 * Estimate sandwich attack profit
 */
function estimateSandwichProfit(userTx, frontRunners, backRunners) {
  if (frontRunners.length === 0 || backRunners.length === 0) return 0;

  const tradeAmount = parseFloat(userTx.amount_in);

  // Simplified profit estimation
  // Real calculation would require pool state and price impact
  const priceImpact = Math.min(tradeAmount / 100000, 0.05); // Max 5% impact
  const estimatedProfit = tradeAmount * priceImpact * 0.5; // Attacker captures ~50% of slippage

  return estimatedProfit.toFixed(2);
}

/**
 * Calculate aggregate risk from all patterns
 */
function calculateAggregateRisk(patterns) {
  const weights = {
    sandwich: 0.40,  // Highest weight - most dangerous
    frontrun: 0.30,
    copycat: 0.15,
    backrun: 0.10,
    jit: 0.05
  };

  let totalRisk = 0;

  for (const [pattern, data] of Object.entries(patterns)) {
    if (data.detected && data.confidence) {
      totalRisk += data.confidence * weights[pattern] * 100;
    }
  }

  return Math.min(Math.round(totalRisk), 100);
}

/**
 * Generate recommendations based on detected patterns
 */
function generateRecommendations(patterns, aggregateRisk) {
  const recommendations = [];

  if (patterns.sandwich.detected) {
    recommendations.push({
      type: 'CRITICAL',
      title: 'Sandwich Attack Detected',
      message: `${patterns.sandwich.frontRunners.length} front-runners and ${patterns.sandwich.backRunners.length} back-runners detected`,
      action: 'Use Flashbots Protect RPC immediately or cancel transaction'
    });
  }

  if (patterns.copycat.detected) {
    recommendations.push({
      type: 'HIGH',
      title: 'Copycat Transactions Detected',
      message: `${patterns.copycat.count} copycat transaction(s) with higher gas`,
      action: 'Increase gas price significantly or wait for mempool to clear'
    });
  }

  if (patterns.frontrun.detected) {
    recommendations.push({
      type: 'HIGH',
      title: 'Front-Running Risk',
      message: `${patterns.frontrun.competitorCount} competing transaction(s) with up to ${patterns.frontrun.maxGasPremium}% higher gas`,
      action: 'Consider private transaction relay or increase gas price'
    });
  }

  if (patterns.backrun.detected) {
    recommendations.push({
      type: 'MEDIUM',
      title: 'Back-Running Detected',
      message: `Transaction may be back-run by arbitrage bots`,
      action: 'Use lower slippage tolerance to reduce arbitrage opportunity'
    });
  }

  if (patterns.jit.detected) {
    recommendations.push({
      type: 'MEDIUM',
      title: 'JIT Liquidity Detected',
      message: `Liquidity being added right before your transaction`,
      action: 'Check pool liquidity carefully before proceeding'
    });
  }

  return recommendations;
}

/**
 * Analyze mempool congestion and timing
 */
export function analyzeMempoolCongestion(mempoolData) {
  const { pendingTxCount, gasPercentiles, blockTimeEstimate } = mempoolData;

  // Determine congestion level
  let congestionLevel = 'low';
  let congestionScore = 0;

  if (pendingTxCount) {
    if (pendingTxCount > 1000) {
      congestionLevel = 'critical';
      congestionScore = 90;
    } else if (pendingTxCount > 500) {
      congestionLevel = 'high';
      congestionScore = 70;
    } else if (pendingTxCount > 200) {
      congestionLevel = 'medium';
      congestionScore = 40;
    } else {
      congestionLevel = 'low';
      congestionScore = 20;
    }
  }

  // Analyze gas price volatility
  const p25 = parseFloat(gasPercentiles.p25);
  const p90 = parseFloat(gasPercentiles.p90);
  const gasVolatility = ((p90 - p25) / p25 * 100).toFixed(2);

  return {
    congestionLevel,
    congestionScore,
    pendingTxCount,
    gasVolatility: `${gasVolatility}%`,
    blockTimeEstimate,
    recommendation: getCongestionRecommendation(congestionLevel)
  };
}

/**
 * Get recommendation based on congestion
 */
function getCongestionRecommendation(level) {
  const recommendations = {
    'critical': 'Mempool is extremely congested. Consider waiting 10-15 minutes or using Flashbots.',
    'high': 'High mempool activity. Use elevated gas prices and monitor closely.',
    'medium': 'Moderate activity. Normal precautions recommended.',
    'low': 'Low congestion. Good time to transact.'
  };

  return recommendations[level] || recommendations['low'];
}
