import { ethers } from 'ethers';
import fetch from 'node-fetch';
import { getCachedMempoolData, cacheMempoolData } from '../database/queries.js';

/**
 * Fetch mempool data for a given token pair
 * Uses caching to avoid excessive API calls
 */
export async function getMempoolData(tokenIn, tokenOut) {
  const tokenPair = `${tokenIn}/${tokenOut}`;

  // Check cache first
  const cached = getCachedMempoolData(tokenPair);
  if (cached) {
    console.log('Using cached mempool data for', tokenPair);
    return cached;
  }

  // Fetch fresh data
  const data = await fetchMempoolFromEtherscan(tokenIn, tokenOut);

  // Cache the result
  cacheMempoolData(tokenPair, data);

  return data;
}

/**
 * Fetch mempool data using Etherscan API (fallback method)
 * In production, this would use Blocknative or Flashbots
 */
async function fetchMempoolFromEtherscan(tokenIn, tokenOut) {
  // Since we can't access real mempool data without paid APIs in MVP,
  // we'll simulate mempool data based on recent blocks
  // In production, use Blocknative or Flashbots Protect RPC

  const provider = await getProvider();

  try {
    // Get current block
    const currentBlock = await provider.getBlockNumber();
    const block = await provider.getBlock(currentBlock);

    // Get recent transactions
    const pendingTxs = await getPendingTransactions(provider);

    // Calculate gas price percentiles
    const gasPrices = block.transactions
      .map(tx => block.baseFeePerGas ? block.baseFeePerGas : BigInt(0))
      .sort((a, b) => Number(a - b));

    const gasPercentiles = {
      p25: gasPrices[Math.floor(gasPrices.length * 0.25)],
      p50: gasPrices[Math.floor(gasPrices.length * 0.50)],
      p75: gasPrices[Math.floor(gasPrices.length * 0.75)],
      p90: gasPrices[Math.floor(gasPrices.length * 0.90)]
    };

    // Simulate mempool data structure
    return {
      tokenPair: `${tokenIn}/${tokenOut}`,
      currentBlock,
      blockTimeEstimate: 12, // Ethereum block time ~12 seconds
      position: 'middle', // User's position in mempool
      gasPercentile: 50, // Default to median
      gasPercentiles: {
        p25: ethers.formatUnits(gasPercentiles.p25 || 0, 'gwei'),
        p50: ethers.formatUnits(gasPercentiles.p50 || 0, 'gwei'),
        p75: ethers.formatUnits(gasPercentiles.p75 || 0, 'gwei'),
        p90: ethers.formatUnits(gasPercentiles.p90 || 0, 'gwei')
      },
      competingTxs: generateSimulatedCompetingTxs(tokenIn, tokenOut),
      similarAttacks: 0, // Will be populated by historical analysis
      timestamp: Math.floor(Date.now() / 1000)
    };
  } catch (error) {
    console.error('Error fetching mempool data:', error);
    // Return simulated data as fallback
    return getSimulatedMempoolData(tokenIn, tokenOut);
  }
}

/**
 * Get provider (Infura or public RPC)
 */
async function getProvider() {
  const infuraKey = process.env.INFURA_PROJECT_ID;

  if (infuraKey) {
    return new ethers.JsonRpcProvider(`https://mainnet.infura.io/v3/${infuraKey}`);
  }

  // Use public Ethereum RPC as fallback
  return new ethers.JsonRpcProvider('https://eth.llamarpc.com');
}

/**
 * Get pending transactions (simplified for MVP)
 */
async function getPendingTransactions(provider) {
  // Note: Most public RPC providers don't support pending transactions
  // This would require Blocknative or similar service in production
  try {
    // Try to get pending transactions
    const pendingBlock = await provider.getBlock('pending');
    return pendingBlock?.transactions || [];
  } catch (error) {
    // Fallback to empty array if not supported
    return [];
  }
}

/**
 * Generate simulated competing transactions for testing
 */
function generateSimulatedCompetingTxs(tokenIn, tokenOut) {
  // In production, this would be real mempool data
  // For MVP, we simulate some competing transactions
  const numCompetitors = Math.floor(Math.random() * 5); // 0-4 competitors

  return Array.from({ length: numCompetitors }, (_, i) => ({
    hash: `0x${Math.random().toString(16).slice(2)}`,
    tokenIn,
    tokenOut,
    tokenPair: `${tokenIn}/${tokenOut}`,
    gasPrice: 20 + Math.random() * 80, // 20-100 gwei
    amount: Math.random() * 10000,
    timestamp: Math.floor(Date.now() / 1000)
  }));
}

/**
 * Get simulated mempool data (for MVP testing)
 */
function getSimulatedMempoolData(tokenIn, tokenOut) {
  return {
    tokenPair: `${tokenIn}/${tokenOut}`,
    currentBlock: 18000000,
    blockTimeEstimate: 12,
    position: 'middle',
    gasPercentile: 50,
    gasPercentiles: {
      p25: '20',
      p50: '35',
      p75: '50',
      p90: '80'
    },
    competingTxs: generateSimulatedCompetingTxs(tokenIn, tokenOut),
    similarAttacks: 0,
    timestamp: Math.floor(Date.now() / 1000)
  };
}

/**
 * Fetch mempool data from Blocknative (premium feature)
 */
export async function getMempoolFromBlocknative(tokenIn, tokenOut) {
  const apiKey = process.env.BLOCKNATIVE_API_KEY;

  if (!apiKey) {
    console.log('Blocknative API key not found, using fallback');
    return getMempoolData(tokenIn, tokenOut);
  }

  try {
    const response = await fetch('https://api.blocknative.com/gasprices/blockprices', {
      headers: {
        'Authorization': apiKey
      }
    });

    const data = await response.json();

    // Transform Blocknative data to our format
    return {
      tokenPair: `${tokenIn}/${tokenOut}`,
      currentBlock: data.blockNumber || 0,
      blockTimeEstimate: 12,
      position: 'middle',
      gasPercentile: 50,
      gasPercentiles: {
        p25: data.blockPrices?.[0]?.estimatedPrices?.[0]?.price || '20',
        p50: data.blockPrices?.[0]?.estimatedPrices?.[1]?.price || '35',
        p75: data.blockPrices?.[0]?.estimatedPrices?.[2]?.price || '50',
        p90: data.blockPrices?.[0]?.estimatedPrices?.[3]?.price || '80'
      },
      competingTxs: [],
      similarAttacks: 0,
      timestamp: Math.floor(Date.now() / 1000)
    };
  } catch (error) {
    console.error('Blocknative API error:', error);
    return getMempoolData(tokenIn, tokenOut);
  }
}
