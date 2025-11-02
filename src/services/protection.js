import { calculateOptimalGasPrice } from '../utils/gas.js';
import { calculateOptimalSplit } from '../utils/calculations.js';

/**
 * Generate protection suggestions based on risk score and attack type
 * @param {number} riskScore - Overall risk score (0-100)
 * @param {string} attackType - Detected attack type
 * @param {object} mempoolData - Mempool data
 * @param {object} input - User transaction input
 * @returns {array} Array of actionable protection suggestions
 */
export function generateProtectionSuggestions(riskScore, attackType, mempoolData, input) {
  const suggestions = [];

  // Critical risk (85+)
  if (riskScore >= 85) {
    suggestions.push({
      priority: 'CRITICAL',
      icon: '🔴',
      title: 'Use Private Transaction Service',
      description: 'Your transaction is at critical risk. Use Flashbots Protect RPC to hide it from public mempool.',
      implementation: 'Change RPC to https://rpc.flashbots.net or use MEV Blocker'
    });

    suggestions.push({
      priority: 'CRITICAL',
      icon: '⚠️',
      title: 'Consider Delaying Transaction',
      description: 'Wait 1-2 blocks for mempool to clear of potential attackers.',
      implementation: 'Wait 15-30 seconds before submitting'
    });
  }

  // High risk (70-84)
  if (riskScore >= 70 && riskScore < 85) {
    suggestions.push({
      priority: 'HIGH',
      icon: '🟠',
      title: 'Use Flashbots Protect RPC',
      description: 'Hide your transaction from public mempool to prevent MEV attacks.',
      implementation: 'Add Flashbots RPC: https://rpc.flashbots.net'
    });

    const optimalGas = calculateOptimalGasPrice(mempoolData.gasPercentiles, attackType);
    suggestions.push({
      priority: 'HIGH',
      icon: '⛽',
      title: `Increase Gas Price to ${optimalGas.recommended} gwei`,
      description: 'Use higher gas to reduce front-running risk.',
      implementation: `Set gas price to ${optimalGas.recommended} gwei (${optimalGas.strategy} strategy)`
    });
  }

  // Medium risk (40-69)
  if (riskScore >= 40 && riskScore < 70) {
    suggestions.push({
      priority: 'MEDIUM',
      icon: '🟡',
      title: 'Increase Slippage Tolerance',
      description: 'Set slippage to 1-2% to reduce transaction failure risk.',
      implementation: 'Update slippage tolerance in your DEX interface'
    });

    suggestions.push({
      priority: 'MEDIUM',
      icon: '⏰',
      title: 'Monitor Transaction Closely',
      description: 'Watch for transaction status after submission.',
      implementation: 'Use Etherscan or your wallet to monitor execution'
    });
  }

  // Sandwich attack specific
  if (attackType === 'sandwich' || attackType === 'potential-sandwich') {
    const split = calculateOptimalSplit(parseFloat(input.amount_in), riskScore);

    if (split.splits > 1) {
      suggestions.push({
        priority: riskScore >= 70 ? 'HIGH' : 'MEDIUM',
        icon: '✂️',
        title: `Split Trade into ${split.splits} Transactions`,
        description: split.recommendation,
        implementation: `Execute ${split.splits} trades of ${split.amountPerSplit.toFixed(2)} ${input.token_in} each`
      });
    }

    suggestions.push({
      priority: 'MEDIUM',
      icon: '📊',
      title: 'Use Limit Orders Instead',
      description: 'Limit orders are less susceptible to sandwich attacks than market orders.',
      implementation: 'Set a limit order on your DEX or use a limit order protocol'
    });
  }

  // Front-run specific
  if (attackType === 'front-run') {
    const optimalGas = calculateOptimalGasPrice(mempoolData.gasPercentiles, attackType);

    suggestions.push({
      priority: 'HIGH',
      icon: '🚀',
      title: `Increase Gas to Top 10%`,
      description: `Set gas price to ${optimalGas.recommended} gwei to outpace competitors.`,
      implementation: `Use ${optimalGas.recommended} gwei gas price`
    });

    suggestions.push({
      priority: 'MEDIUM',
      icon: '⏱️',
      title: 'Set Transaction Deadline',
      description: 'Add a deadline to prevent delayed execution.',
      implementation: 'Set deadline parameter to 20 minutes in your transaction'
    });
  }

  // General best practices (always included)
  suggestions.push({
    priority: 'INFO',
    icon: '✅',
    title: 'Monitor After Submission',
    description: 'Always check transaction status after submission.',
    implementation: 'Use block explorer (Etherscan) to verify execution'
  });

  // Low risk advice
  if (riskScore < 40) {
    suggestions.push({
      priority: 'INFO',
      icon: '👍',
      title: 'Low Risk Detected',
      description: 'Transaction appears safe to proceed with normal settings.',
      implementation: 'Use standard slippage and gas settings'
    });
  }

  // Sort by priority
  const priorityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'INFO': 3 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions;
}

/**
 * Format suggestions for output (simple text format)
 * @param {array} suggestions - Array of suggestion objects
 * @returns {array} Formatted strings
 */
export function formatSuggestionsForOutput(suggestions) {
  return suggestions.map(s =>
    `${s.icon} ${s.priority}: ${s.title} - ${s.description}`
  );
}

/**
 * Get specific DEX recommendations based on the DEX being used
 * @param {string} dex - DEX name
 * @param {number} riskScore - Risk score
 * @returns {array} DEX-specific suggestions
 */
export function getDexSpecificRecommendations(dex, riskScore) {
  const recommendations = [];

  switch (dex.toLowerCase()) {
    case 'uniswap-v2':
    case 'uniswap-v3':
      if (riskScore >= 70) {
        recommendations.push({
          priority: 'HIGH',
          icon: '🦄',
          title: 'Use Uniswap via Flashbots',
          description: 'Submit your Uniswap transaction through Flashbots Protect.',
          implementation: 'Visit protect.flashbots.net to submit protected transaction'
        });
      }
      break;

    case 'curve':
      recommendations.push({
        priority: 'INFO',
        icon: 'ℹ️',
        title: 'Curve Has Lower MEV Risk',
        description: 'Curve\'s stable swap design reduces sandwich attack profitability.',
        implementation: 'Curve is generally safer for stable swaps'
      });
      break;

    case 'balancer':
      recommendations.push({
        priority: 'INFO',
        icon: 'ℹ️',
        title: 'Balancer Multi-Token Pools',
        description: 'Balancer pools may have different MEV characteristics.',
        implementation: 'Check pool liquidity depth before trading'
      });
      break;

    default:
      break;
  }

  return recommendations;
}

/**
 * Generate emergency recommendations for critical situations
 * @param {object} detectionResults - All detection results
 * @returns {object} Emergency action plan
 */
export function generateEmergencyRecommendations(detectionResults) {
  const { riskScore, attackType } = detectionResults;

  if (riskScore < 85) {
    return null; // Not an emergency
  }

  return {
    severity: 'EMERGENCY',
    icon: '🚨',
    title: 'CRITICAL MEV RISK DETECTED',
    immediateAction: 'DO NOT SUBMIT THIS TRANSACTION',
    explanation: `High probability ${attackType} attack detected with ${riskScore}% risk score.`,
    alternatives: [
      'Use Flashbots Protect RPC (https://rpc.flashbots.net)',
      'Wait 5-10 minutes for mempool to clear',
      'Split into multiple smaller transactions',
      'Use a private transaction service like MEV Blocker',
      'Consider using a different DEX or route'
    ],
    estimatedSavings: `Could save up to $${detectionResults.estimatedLoss} by using protection`
  };
}
