# UPGRADE TO 100% REAL MEMPOOL DATA

## OBJECTIVE

Enable real-time pending transaction monitoring using Infura WebSocket and Blocknative API.

**Current State:** 85% real (gas + pools only, `realMempoolData: false`)
**Target State:** 100% real (gas + pools + live mempool streaming, `realMempoolData: true`)

---

## ENVIRONMENT VARIABLES

User has added to `.env`:
```bash
INFURA_PROJECT_ID=c7f1exxxxxxxxxxx
BLOCKNATIVE_API_KEY=xxxxx
```

---

## REQUIREMENTS

**Update `src/services/mempool-enhanced.js` to:**

1. **Add WebSocket support for Infura**
   - Install `ws` package if not already: `npm install ws`
   - Connect to `wss://mainnet.infura.io/ws/v3/${INFURA_PROJECT_ID}`
   - Subscribe to `newPendingTransactions` event
   - Cache pending transaction hashes (update every 5 seconds)

2. **Add Blocknative Mempool Stream API**
   - Use Blocknative's `/transaction/stream` endpoint
   - Fallback to Infura if Blocknative fails or rate limited
   - API: `https://api.blocknative.com/v0/pending`
   - Headers: `Authorization: ${BLOCKNATIVE_API_KEY}`

3. **Update `getPendingTransactionsReal()` function**
   - Current implementation returns empty array or simulated data
   - Replace with actual WebSocket subscription to Infura
   - For each pending tx hash, fetch full transaction details using `eth_getTransactionByHash`
   - Filter for DEX transactions (Uniswap, Sushiswap, 1inch routers)
   - Cache results for 5 seconds to reduce RPC calls

4. **Update health check**
   - Change `realMempoolData: false` to `realMempoolData: true`
   - Add `mempoolSource` field showing "infura" or "blocknative"

---

## SUCCESS CRITERIA

After implementation:

```bash
# Test 1: Health check shows real mempool
curl http://localhost:3000/health | grep realMempoolData
# Should return: "realMempoolData": true

# Test 2: Scan shows real pending tx data
curl -X POST http://localhost:3000/api/v1/scan_transaction \
  -H "Content-Type: application/json" \
  -d '{"token_in":"USDC","token_out":"ETH","amount_in":"1000","dex":"uniswap-v2"}'
# Should show: "data_source": "real-mempool" (not "ethereum-rpc")
# Should show: "competing_txs" with actual pending transactions (if any exist)
```

---

## IMPLEMENTATION NOTES

**Infura WebSocket Pattern:**
```javascript
const ws = new WebSocket(`wss://mainnet.infura.io/ws/v3/${INFURA_PROJECT_ID}`);

ws.on('open', () => {
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_subscribe',
    params: ['newPendingTransactions']
  }));
});

ws.on('message', (data) => {
  const response = JSON.parse(data);
  if (response.params) {
    const txHash = response.params.result;
    // Fetch full tx details and add to cache
  }
});
```

**Blocknative API Pattern:**
```javascript
const response = await fetch('https://api.blocknative.com/v0/pending', {
  headers: {
    'Authorization': BLOCKNATIVE_API_KEY,
    'Content-Type': 'application/json'
  }
});
const data = await response.json();
// Parse and return pending transactions
```

**Important:**
- Keep 5-second cache to avoid hitting rate limits
- Always have fallback to safe defaults if both APIs fail
- Log which data source is being used (Blocknative > Infura > fallback)
- Return real transaction data in `competingTxs` array

---

## EXPECTED BEHAVIOR

**Before:** Scanner uses on-chain RPC calls to recent blocks (15-30 second delay)
**After:** Scanner streams live pending transactions from mempool (0-2 second delay)

**Sandwich Detection Improvement:**
- Before: Can't see pending front-run/back-run transactions
- After: Detects competing high-gas and low-gas transactions in real-time

---

## TESTING

Run these tests after implementation:

```bash
# 1. Verify WebSocket connection (check logs)
npm start
# Should see: "🔌 Connected to Infura WebSocket" or "🔌 Connected to Blocknative"

# 2. Test health endpoint
curl http://localhost:3000/health
# Should show: "realMempoolData": true, "mempoolSource": "infura" or "blocknative"

# 3. Test scan during high network activity
curl -X POST http://localhost:3000/api/v1/scan_transaction \
  -H "Content-Type: application/json" \
  -d '{"token_in":"USDC","token_out":"ETH","amount_in":"50000","dex":"uniswap-v2"}'
# Should show real competing_txs if any exist in mempool

# 4. Check logs for mempool data
# Should see: "✅ Found X DEX transactions in mempool"
```

---

## DELIVERABLE

Update these files:
1. `src/services/mempool-enhanced.js` - Add WebSocket and Blocknative integration
2. `package.json` - Add `ws` dependency if needed
3. `server-enhanced.js` - Update health check to show `realMempoolData: true`

**Goal:** Make `realMempoolData: true` and `data_source: "real-mempool"` in all responses.