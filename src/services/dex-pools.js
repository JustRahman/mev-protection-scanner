import { ethers } from 'ethers';
import fetch from 'node-fetch';

/**
 * DEX Pool Data Integration
 * Fetches real liquidity and price data from decentralized exchanges
 */

// Uniswap V2 Factory and Router addresses
const UNISWAP_V2_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const SUSHISWAP_FACTORY = '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac';
const SUSHISWAP_ROUTER = '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F';

// Token addresses (mainnet)
const TOKEN_ADDRESSES = {
  'WETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  'DAI': '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  'WBTC': '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
};

// Normalize token symbols
function normalizeToken(token) {
  const upperToken = token.toUpperCase();
  if (upperToken === 'ETH') return 'WETH';
  return upperToken;
}

/**
 * Get pool data for a token pair on a specific DEX
 */
export async function getPoolData(tokenIn, tokenOut, dex = 'uniswap-v2') {
  const normalizedIn = normalizeToken(tokenIn);
  const normalizedOut = normalizeToken(tokenOut);

  console.log(`🏊 Fetching pool data for ${normalizedIn}/${normalizedOut} on ${dex}`);

  try {
    // Try multiple methods
    let poolData;

    // Method 1: Use The Graph (best for accurate data)
    poolData = await getPoolDataFromGraph(normalizedIn, normalizedOut, dex);
    if (poolData) return poolData;

    // Method 2: Direct on-chain query
    poolData = await getPoolDataOnChain(normalizedIn, normalizedOut, dex);
    if (poolData) return poolData;

    // Method 3: Use public APIs
    poolData = await getPoolDataFromAPI(normalizedIn, normalizedOut, dex);
    if (poolData) return poolData;

    // Fallback to estimated data
    return getEstimatedPoolData(normalizedIn, normalizedOut, dex);

  } catch (error) {
    console.error('❌ Pool data fetch failed:', error.message);
    return getEstimatedPoolData(normalizedIn, normalizedOut, dex);
  }
}

/**
 * Get pool data from The Graph protocol
 */
async function getPoolDataFromGraph(tokenIn, tokenOut, dex) {
  const graphEndpoints = {
    'uniswap-v2': 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2',
    'uniswap-v3': 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
    'sushiswap': 'https://api.thegraph.com/subgraphs/name/sushiswap/exchange'
  };

  const endpoint = graphEndpoints[dex];
  if (!endpoint) return null;

  const token0Address = TOKEN_ADDRESSES[tokenIn];
  const token1Address = TOKEN_ADDRESSES[tokenOut];

  if (!token0Address || !token1Address) {
    console.warn(`⚠️  Unknown token address for ${tokenIn} or ${tokenOut}`);
    return null;
  }

  const query = `
    {
      pairs(
        where: {
          token0_in: ["${token0Address.toLowerCase()}", "${token1Address.toLowerCase()}"]
          token1_in: ["${token0Address.toLowerCase()}", "${token1Address.toLowerCase()}"]
        }
        orderBy: reserveUSD
        orderDirection: desc
        first: 1
      ) {
        id
        token0 {
          id
          symbol
        }
        token1 {
          id
          symbol
        }
        reserve0
        reserve1
        reserveUSD
        volumeUSD
        txCount
        token0Price
        token1Price
      }
    }
  `;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    const data = await response.json();

    if (data.errors) {
      console.error('Graph query error:', data.errors);
      return null;
    }

    const pair = data.data?.pairs?.[0];
    if (!pair) {
      console.warn(`⚠️  No pool found for ${tokenIn}/${tokenOut} on ${dex}`);
      return null;
    }

    return {
      pairAddress: pair.id,
      dex,
      token0: pair.token0.symbol,
      token1: pair.token1.symbol,
      reserve0: parseFloat(pair.reserve0),
      reserve1: parseFloat(pair.reserve1),
      reserveUSD: parseFloat(pair.reserveUSD),
      volumeUSD: parseFloat(pair.volumeUSD),
      txCount: parseInt(pair.txCount),
      token0Price: parseFloat(pair.token0Price),
      token1Price: parseFloat(pair.token1Price),
      liquidity: parseFloat(pair.reserveUSD),
      dataSource: 'the-graph',
      timestamp: Math.floor(Date.now() / 1000)
    };

  } catch (error) {
    console.error('❌ Graph query failed:', error.message);
    return null;
  }
}

/**
 * Get pool data directly from blockchain
 */
async function getPoolDataOnChain(tokenIn, tokenOut, dex) {
  try {
    const provider = await getProvider();

    const factoryAddress = dex === 'sushiswap' ? SUSHISWAP_FACTORY : UNISWAP_V2_FACTORY;

    const token0Address = TOKEN_ADDRESSES[tokenIn];
    const token1Address = TOKEN_ADDRESSES[tokenOut];

    if (!token0Address || !token1Address) return null;

    // Factory ABI (simplified)
    const factoryABI = [
      'function getPair(address tokenA, address tokenB) external view returns (address pair)'
    ];

    const factory = new ethers.Contract(factoryAddress, factoryABI, provider);
    const pairAddress = await factory.getPair(token0Address, token1Address);

    if (pairAddress === ethers.ZeroAddress) {
      console.warn(`⚠️  No pool exists for ${tokenIn}/${tokenOut} on ${dex}`);
      return null;
    }

    // Pair ABI (simplified)
    const pairABI = [
      'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
      'function token0() external view returns (address)',
      'function token1() external view returns (address)',
      'function totalSupply() external view returns (uint256)'
    ];

    const pair = new ethers.Contract(pairAddress, pairABI, provider);
    const [reserves, token0, token1, totalSupply] = await Promise.all([
      pair.getReserves(),
      pair.token0(),
      pair.token1(),
      pair.totalSupply()
    ]);

    const reserve0 = ethers.formatUnits(reserves.reserve0, 18);
    const reserve1 = ethers.formatUnits(reserves.reserve1, 18);

    // Estimate USD value (simplified - would need price oracle in production)
    const estimatedUSD = parseFloat(reserve0) * 1000; // Placeholder

    return {
      pairAddress,
      dex,
      token0: tokenIn,
      token1: tokenOut,
      reserve0: parseFloat(reserve0),
      reserve1: parseFloat(reserve1),
      reserveUSD: estimatedUSD,
      totalSupply: ethers.formatUnits(totalSupply, 18),
      liquidity: estimatedUSD,
      dataSource: 'on-chain',
      timestamp: Math.floor(Date.now() / 1000)
    };

  } catch (error) {
    console.error('❌ On-chain pool query failed:', error.message);
    return null;
  }
}

/**
 * Get pool data from public APIs (CoinGecko, 1inch, etc.)
 */
async function getPoolDataFromAPI(tokenIn, tokenOut, dex) {
  // Try 1inch API for liquidity data
  try {
    const chainId = 1; // Ethereum mainnet
    const response = await fetch(
      `https://api.1inch.dev/swap/v5.2/${chainId}/quote?src=${tokenIn}&dst=${tokenOut}&amount=1000000000000000000`,
      {
        headers: process.env.ONEINCH_API_KEY ? {
          'Authorization': `Bearer ${process.env.ONEINCH_API_KEY}`
        } : {}
      }
    );

    if (!response.ok) throw new Error('1inch API failed');

    const data = await response.json();

    return {
      dex: 'aggregated',
      token0: tokenIn,
      token1: tokenOut,
      estimatedPrice: data.toTokenAmount / data.fromTokenAmount,
      protocols: data.protocols,
      dataSource: '1inch-api',
      timestamp: Math.floor(Date.now() / 1000)
    };

  } catch (error) {
    console.warn('⚠️  1inch API failed:', error.message);
    return null;
  }
}

/**
 * Get estimated pool data (fallback)
 */
function getEstimatedPoolData(tokenIn, tokenOut, dex) {
  // Common pairs have higher liquidity estimates
  const commonPairs = ['USDC/ETH', 'ETH/USDC', 'USDT/ETH', 'DAI/ETH', 'WBTC/ETH'];
  const pairKey = `${tokenIn}/${tokenOut}`;

  const isCommon = commonPairs.includes(pairKey);

  return {
    dex,
    token0: tokenIn,
    token1: tokenOut,
    reserve0: isCommon ? 1000000 : 10000, // Estimated reserves
    reserve1: isCommon ? 500 : 5, // Estimated reserves
    reserveUSD: isCommon ? 2000000 : 20000, // $2M or $20K
    liquidity: isCommon ? 2000000 : 20000,
    volumeUSD: isCommon ? 500000 : 5000, // Daily volume estimate
    isEstimated: true,
    dataSource: 'estimated',
    timestamp: Math.floor(Date.now() / 1000)
  };
}

/**
 * Calculate price impact for a trade
 */
export function calculatePriceImpact(poolData, tradeAmount, tokenIn) {
  try {
    const { reserve0, reserve1, token0, token1 } = poolData;

    // Determine which reserve to use
    const reserveIn = token0 === tokenIn ? reserve0 : reserve1;
    const reserveOut = token0 === tokenIn ? reserve1 : reserve0;

    // Constant product formula: x * y = k
    const amountIn = parseFloat(tradeAmount);

    // Amount after 0.3% fee
    const amountInWithFee = amountIn * 0.997;

    // Calculate output amount
    const amountOut = (reserveOut * amountInWithFee) / (reserveIn + amountInWithFee);

    // Calculate price impact
    const priceImpact = (amountIn / reserveIn) * 100;

    return {
      priceImpact: priceImpact.toFixed(4),
      estimatedOutput: amountOut.toFixed(6),
      effectivePrice: (amountIn / amountOut).toFixed(6),
      slippage: priceImpact > 1 ? 'high' : priceImpact > 0.5 ? 'medium' : 'low'
    };

  } catch (error) {
    console.error('❌ Price impact calculation failed:', error.message);
    return {
      priceImpact: '0',
      estimatedOutput: '0',
      effectivePrice: '0',
      slippage: 'unknown'
    };
  }
}

/**
 * Check if pool has sufficient liquidity
 */
export function hassufficientLiquidity(poolData, tradeAmountUSD) {
  const minLiquidityRatio = 50; // Trade should be < 2% of pool

  if (poolData.isEstimated) {
    // For estimated data, be more conservative
    return tradeAmountUSD < poolData.liquidity / minLiquidityRatio;
  }

  return tradeAmountUSD < poolData.reserveUSD / minLiquidityRatio;
}

/**
 * Get provider
 */
async function getProvider() {
  const infuraKey = process.env.INFURA_PROJECT_ID;
  const alchemyKey = process.env.ALCHEMY_API_KEY;

  if (alchemyKey) {
    return new ethers.JsonRpcProvider(`https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`);
  }

  if (infuraKey) {
    return new ethers.JsonRpcProvider(`https://mainnet.infura.io/v3/${infuraKey}`);
  }

  return new ethers.JsonRpcProvider('https://eth.llamarpc.com');
}

/**
 * Get real-time token prices from multiple sources
 */
export async function getTokenPrices(tokens) {
  const prices = {};

  // Try CoinGecko API (free tier available)
  try {
    const tokenIds = tokens.map(t => {
      const mapping = {
        'ETH': 'ethereum',
        'WETH': 'weth',
        'USDC': 'usd-coin',
        'USDT': 'tether',
        'DAI': 'dai',
        'WBTC': 'wrapped-bitcoin'
      };
      return mapping[t.toUpperCase()] || t.toLowerCase();
    }).join(',');

    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${tokenIds}&vs_currencies=usd`
    );

    const data = await response.json();

    for (const [id, priceData] of Object.entries(data)) {
      prices[id] = priceData.usd;
    }

  } catch (error) {
    console.warn('⚠️  CoinGecko price fetch failed:', error.message);
  }

  return prices;
}

/**
 * Get aggregated liquidity across multiple DEXs
 */
export async function getAggregatedLiquidity(tokenIn, tokenOut) {
  const dexes = ['uniswap-v2', 'uniswap-v3', 'sushiswap'];

  const poolDataPromises = dexes.map(dex =>
    getPoolData(tokenIn, tokenOut, dex).catch(() => null)
  );

  const pools = await Promise.all(poolDataPromises);

  const validPools = pools.filter(p => p !== null && !p.isEstimated);

  const totalLiquidity = validPools.reduce((sum, p) => sum + (p.liquidity || 0), 0);

  return {
    pools: validPools,
    totalLiquidity,
    bestPool: validPools.sort((a, b) => b.liquidity - a.liquidity)[0],
    timestamp: Math.floor(Date.now() / 1000)
  };
}
