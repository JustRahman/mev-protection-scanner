import WebSocket from 'ws';
import { ethers } from 'ethers';
import fetch from 'node-fetch';

/**
 * Real-time Mempool Monitor using WebSocket
 * Streams pending transactions from Infura or Blocknative
 */

// In-memory cache of pending transactions
const pendingTxCache = {
  transactions: [],
  lastUpdate: 0,
  isConnected: false,
  source: 'none'
};

const CACHE_TTL = 5000; // 5 seconds
const MAX_CACHED_TXS = 100;

let wsConnection = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Initialize WebSocket connection to Infura or Blocknative
 */
export function initializeWebSocketMempool() {
  const infuraKey = process.env.INFURA_PROJECT_ID;
  const blocknativeKey = process.env.BLOCKNATIVE_API_KEY;

  // Prioritize Infura WebSocket (true streaming) over Blocknative (HTTP polling)
  if (infuraKey) {
    console.log('🔌 Initializing Infura WebSocket mempool...');
    return initializeInfuraWebSocket(infuraKey);
  }

  if (blocknativeKey) {
    console.log('🔌 Initializing Blocknative mempool stream...');
    return initializeBlocknativeStream(blocknativeKey);
  }

  console.log('⚠️  No Infura or Blocknative API keys found - WebSocket mempool disabled');
  return false;
}

/**
 * Initialize Infura WebSocket for pending transactions
 */
function initializeInfuraWebSocket(infuraKey) {
  try {
    const wsUrl = `wss://mainnet.infura.io/ws/v3/${infuraKey}`;

    wsConnection = new WebSocket(wsUrl);

    wsConnection.on('open', () => {
      console.log('✅ Connected to Infura WebSocket');
      pendingTxCache.isConnected = true;
      pendingTxCache.source = 'infura';
      reconnectAttempts = 0;

      // Subscribe to pending transactions
      wsConnection.send(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_subscribe',
        params: ['newPendingTransactions']
      }));
    });

    wsConnection.on('message', async (data) => {
      try {
        const response = JSON.parse(data.toString());

        // Handle subscription confirmation
        if (response.id === 1 && response.result) {
          console.log('📡 Subscribed to pending transactions:', response.result);
          return;
        }

        // Handle new pending transaction
        if (response.params && response.params.result) {
          const txHash = response.params.result;
          await processPendingTransaction(txHash, infuraKey);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error.message);
      }
    });

    wsConnection.on('error', (error) => {
      console.error('❌ Infura WebSocket error:', error.message);
      pendingTxCache.isConnected = false;
    });

    wsConnection.on('close', () => {
      console.log('🔌 Infura WebSocket closed');
      pendingTxCache.isConnected = false;
      pendingTxCache.source = 'none';

      // Attempt to reconnect
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`🔄 Reconnecting attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`);
        setTimeout(() => initializeInfuraWebSocket(infuraKey), 5000);
      }
    });

    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Infura WebSocket:', error.message);
    return false;
  }
}

/**
 * Process a pending transaction hash
 */
async function processPendingTransaction(txHash, infuraKey) {
  try {
    // Fetch full transaction details
    const provider = new ethers.JsonRpcProvider(`https://mainnet.infura.io/v3/${infuraKey}`);
    const tx = await provider.getTransaction(txHash);

    if (!tx) return;

    // Check if it's a DEX transaction
    if (isDexTransaction(tx)) {
      const processedTx = {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: ethers.formatEther(tx.value || 0),
        gasPrice: tx.gasPrice ? ethers.formatUnits(tx.gasPrice, 'gwei') : tx.maxFeePerGas ? ethers.formatUnits(tx.maxFeePerGas, 'gwei') : '0',
        input: tx.data?.slice(0, 10), // Method signature
        tokenPair: extractTokenPairFromTx(tx),
        timestamp: Math.floor(Date.now() / 1000),
        isSuspicious: false
      };

      // Add to cache
      addToPendingCache(processedTx);
    }
  } catch (error) {
    // Silently fail for individual transactions to avoid spam
    if (error.code !== 'CALL_EXCEPTION') {
      console.error('Error fetching tx details:', error.message);
    }
  }
}

/**
 * Check if transaction is a DEX swap
 */
function isDexTransaction(tx) {
  if (!tx.to) return false;

  // Common DEX router addresses
  const DEX_ROUTERS = [
    '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', // Uniswap V2
    '0xe592427a0aece92de3edee1f18e0157c05861564', // Uniswap V3
    '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f', // Sushiswap
    '0x1111111254fb6c44bac0bed2854e76f90643097d', // 1inch
  ];

  const toAddress = tx.to.toLowerCase();
  const isDexRouter = DEX_ROUTERS.some(router => router === toAddress);

  // Check swap method signatures
  const swapSignatures = [
    '0x38ed1739', // swapExactTokensForTokens
    '0x7ff36ab5', // swapExactETHForTokens
    '0x18cbafe5', // swapExactTokensForETH
    '0x414bf389', // exactInputSingle (V3)
    '0xc04b8d59', // exactInput (V3)
  ];

  const methodSig = tx.data?.slice(0, 10);
  const isSwapMethod = methodSig && swapSignatures.includes(methodSig);

  return isDexRouter || isSwapMethod;
}

/**
 * Extract token pair from transaction data (simplified)
 */
function extractTokenPairFromTx(tx) {
  // This would require full ABI decoding in production
  // For now, return a generic identifier
  return 'UNKNOWN/UNKNOWN';
}

/**
 * Add transaction to pending cache
 */
function addToPendingCache(tx) {
  pendingTxCache.transactions.unshift(tx);

  // Keep only most recent transactions
  if (pendingTxCache.transactions.length > MAX_CACHED_TXS) {
    pendingTxCache.transactions = pendingTxCache.transactions.slice(0, MAX_CACHED_TXS);
  }

  pendingTxCache.lastUpdate = Date.now();
}

/**
 * Initialize Blocknative mempool stream
 */
async function initializeBlocknativeStream(blocknativeKey) {
  // Blocknative uses SDK which we'll implement simplified version
  console.log('ℹ️  Blocknative stream initialization - using HTTP polling fallback');

  // Start periodic polling of Blocknative API
  setInterval(async () => {
    try {
      await pollBlocknativeMempool(blocknativeKey);
    } catch (error) {
      console.error('Blocknative poll error:', error.message);
    }
  }, 5000); // Poll every 5 seconds

  pendingTxCache.source = 'blocknative';
  return true;
}

/**
 * Poll Blocknative API for pending transactions
 */
async function pollBlocknativeMempool(blocknativeKey) {
  try {
    // Note: Blocknative's actual API endpoint may differ
    // This is a placeholder implementation
    const response = await fetch('https://api.blocknative.com/gasprices/blockprices', {
      headers: {
        'Authorization': blocknativeKey
      }
    });

    if (!response.ok) {
      throw new Error(`Blocknative API error: ${response.status}`);
    }

    const data = await response.json();

    // Blocknative returns gas price data, not full mempool
    // In production, you'd use their SDK for full mempool access
    pendingTxCache.isConnected = true;
    pendingTxCache.source = 'blocknative';
    pendingTxCache.lastUpdate = Date.now();

  } catch (error) {
    console.error('Blocknative API error:', error.message);
    pendingTxCache.isConnected = false;
  }
}

/**
 * Get cached pending transactions
 */
export function getCachedPendingTransactions(tokenIn, tokenOut) {
  const now = Date.now();

  // Check if cache is stale
  if (now - pendingTxCache.lastUpdate > CACHE_TTL) {
    return {
      transactions: [],
      isRealTime: false,
      source: pendingTxCache.source,
      cacheAge: now - pendingTxCache.lastUpdate
    };
  }

  // Filter for relevant token pairs if possible
  const filtered = pendingTxCache.transactions.filter(tx => {
    // In production, this would filter by actual token pair
    return true;
  });

  return {
    transactions: filtered.slice(0, 20), // Return top 20
    isRealTime: pendingTxCache.isConnected,
    source: pendingTxCache.source,
    cacheAge: now - pendingTxCache.lastUpdate,
    totalCached: pendingTxCache.transactions.length
  };
}

/**
 * Get WebSocket connection status
 */
export function getWebSocketStatus() {
  return {
    isConnected: pendingTxCache.isConnected,
    source: pendingTxCache.source,
    cachedTransactions: pendingTxCache.transactions.length,
    lastUpdate: pendingTxCache.lastUpdate,
    cacheAge: Date.now() - pendingTxCache.lastUpdate
  };
}

/**
 * Close WebSocket connection
 */
export function closeWebSocketMempool() {
  if (wsConnection) {
    wsConnection.close();
    wsConnection = null;
  }
  pendingTxCache.isConnected = false;
  pendingTxCache.source = 'none';
  console.log('🔌 WebSocket mempool closed');
}
