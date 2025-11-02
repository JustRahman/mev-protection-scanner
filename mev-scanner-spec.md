# MEV Protection Scanner - Build Specification

## Project Overview

Build an AI agent that detects MEV (Maximal Extractable Value) attacks on pending transactions, specifically sandwich attacks and front-running. The agent should analyze pending transactions in the mempool and provide risk assessment with protection recommendations.

## Core Functionality

### Input Schema
```json
{
  "transaction_hash": "0x...",  // Optional: pending tx hash to analyze
  "wallet_address": "0x...",     // Optional: wallet planning to trade
  "token_in": "USDC",            // Token being sold
  "token_out": "ETH",            // Token being bought
  "amount_in": "1000",           // Amount to trade
  "dex": "uniswap-v2"           // DEX to use
}
```

### Output Schema
```json
{
  "risk_score": 85,              // 0-100, higher = more risky
  "attack_type": "sandwich",     // sandwich | front-run | back-run | none
  "risk_level": "high",          // low | medium | high | critical
  "estimated_loss_usd": 45.50,   // Potential loss if exploited
  "similar_attacks_found": 12,   // Number of similar patterns detected
  "protection_suggestions": [
    "Use Flashbots Protect RPC",
    "Increase slippage tolerance to 2%",
    "Split trade into smaller chunks"
  ],
  "details": {
    "mempool_position": "back",  // front | middle | back
    "gas_price_percentile": 75,  // Where your gas ranks (0-100)
    "competing_txs": 3,          // Similar pending transactions
    "block_time_estimate": 12    // Seconds until next block
  }
}
```

## Technical Implementation

### Tech Stack
- **Framework:** @lucid-dreams/agent-kit@0.2.22
- **Runtime:** Node.js 20+
- **Language:** JavaScript (ES2023)
- **Database:** SQLite (for caching historical patterns)
- **Deployment:** Railway
- **Payment:** X402 on Base network

### Data Sources

#### Option 1: Blocknative Mempool API (Recommended)
```javascript
// Free tier: 1,000 requests/month
// Paid: $99/mo for 50K requests
// Provides: Real-time mempool streaming, gas predictions
```

#### Option 2: Flashbots Protect RPC
```javascript
// Free
// Provides: MEV protection insights, bundle submission
// Endpoint: https://rpc.flashbots.net
```

#### Option 3: Etherscan API (Fallback)
```javascript
// Free tier: 5 calls/second
// For historical data and pattern analysis
```

### Core Detection Logic

#### 1. Sandwich Attack Detection
```javascript
/**
 * Detect sandwich attacks by analyzing:
 * - Pending transactions with same token pair
 * - Gas price ordering (attacker front-runs with higher gas)
 * - Transaction amount comparison
 * - Time proximity (within same block)
 * 
 * Algorithm:
 * 1. Query mempool for pending txs with same token pair
 * 2. Check if any tx has higher gas price (front-run)
 * 3. Check if any tx has lower gas price (back-run)
 * 4. Calculate price impact if both exist
 * 5. Return risk score based on findings
 */

function detectSandwich(userTx, mempoolTxs) {
  const samePairTxs = mempoolTxs.filter(tx => 
    tx.tokenIn === userTx.tokenIn && 
    tx.tokenOut === userTx.tokenOut
  );
  
  const frontRunners = samePairTxs.filter(tx => 
    tx.gasPrice > userTx.gasPrice
  );
  
  const backRunners = samePairTxs.filter(tx => 
    tx.gasPrice < userTx.gasPrice
  );
  
  if (frontRunners.length > 0 && backRunners.length > 0) {
    // High probability sandwich attack
    return {
      risk: 'high',
      score: 85,
      type: 'sandwich'
    };
  }
  
  // More detection logic...
}
```

#### 2. Front-Running Detection
```javascript
/**
 * Detect front-running by:
 * - Comparing gas prices in mempool
 * - Analyzing transaction order
 * - Checking for copycat transactions
 */

function detectFrontRun(userTx, mempoolTxs) {
  const similarTxs = mempoolTxs.filter(tx =>
    tx.tokenPair === userTx.tokenPair &&
    tx.gasPrice > userTx.gasPrice * 1.1 // 10% higher gas
  );
  
  if (similarTxs.length > 0) {
    return {
      risk: 'medium',
      score: 65,
      type: 'front-run',
      competitors: similarTxs.length
    };
  }
  
  return { risk: 'low', score: 20, type: 'none' };
}
```

#### 3. Historical Pattern Analysis
```javascript
/**
 * Analyze historical sandwich attacks to improve detection.
 * Store known attacker addresses and patterns in SQLite.
 */

// Database schema
CREATE TABLE mev_attacks (
  id INTEGER PRIMARY KEY,
  block_number INTEGER,
  attacker_address TEXT,
  victim_address TEXT,
  token_pair TEXT,
  profit_usd REAL,
  attack_type TEXT,
  timestamp INTEGER
);

// Query historical data
function checkHistoricalPatterns(txParams) {
  // Check if token pair is frequently attacked
  // Check if any involved addresses are known MEV bots
  // Return historical risk score
}
```

### Protection Recommendations
```javascript
function generateProtectionSuggestions(riskScore, attackType) {
  const suggestions = [];
  
  if (riskScore > 70) {
    suggestions.push("🔴 HIGH RISK: Use Flashbots Protect RPC to hide transaction from public mempool");
    suggestions.push("Consider using private transaction service (e.g., MEV Blocker, Flashbots)");
  }
  
  if (riskScore > 50) {
    suggestions.push("⚠️ MEDIUM RISK: Increase slippage tolerance to 1-2%");
    suggestions.push("Wait 1-2 blocks for mempool to clear");
  }
  
  if (attackType === 'sandwich') {
    suggestions.push("Split large trade into 3-5 smaller transactions");
    suggestions.push("Use limit orders instead of market orders");
  }
  
  if (attackType === 'front-run') {
    suggestions.push("Increase gas price to be in top 10% of mempool");
    suggestions.push("Use transaction deadline to prevent delayed execution");
  }
  
  suggestions.push("✅ ALWAYS: Monitor transaction status after submission");
  
  return suggestions;
}
```

## Agent Implementation

### File Structure
```
mev-protection-scanner/
├── src/
│   ├── agent.js              # Main agent-kit setup
│   ├── detectors/
│   │   ├── sandwich.js       # Sandwich attack detection
│   │   ├── frontrun.js       # Front-run detection
│   │   └── historical.js     # Historical pattern analysis
│   ├── services/
│   │   ├── mempool.js        # Mempool data fetching
│   │   ├── dex.js            # DEX price impact calculations
│   │   └── protection.js     # Protection recommendations
│   ├── database/
│   │   ├── init.js           # SQLite initialization
│   │   └── queries.js        # Database queries
│   └── utils/
│       ├── gas.js            # Gas price utilities
│       └── calculations.js   # Price impact, loss estimates
├── data/
│   └── mev_attacks.db        # SQLite database
├── .env
├── package.json
└── README.md
```

### Main Agent Setup (src/agent.js)
```javascript
import { createAgentApp } from '@lucid-dreams/agent-kit';
import { z } from 'zod';
import { detectSandwich } from './detectors/sandwich.js';
import { detectFrontRun } from './detectors/frontrun.js';
import { getMempoolData } from './services/mempool.js';
import { generateProtectionSuggestions } from './services/protection.js';

const { app, addEntrypoint } = createAgentApp({
  name: 'mev-protection-scanner',
  version: '1.0.0',
  description: 'Detect MEV attacks and provide protection recommendations',
  payments: {
    enabled: true,
    network: 'base',
    amount: '0.10', // $0.10 per scan in USDC
    currency: 'USDC'
  }
});

addEntrypoint({
  key: 'scan_transaction',
  description: 'Scan a transaction for MEV attack risks',
  input: z.object({
    transaction_hash: z.string().optional(),
    wallet_address: z.string().optional(),
    token_in: z.string(),
    token_out: z.string(),
    amount_in: z.string(),
    dex: z.enum(['uniswap-v2', 'uniswap-v3', 'sushiswap', 'curve', 'balancer'])
  }),
  
  async handler({ input }) {
    try {
      // 1. Fetch mempool data
      const mempoolData = await getMempoolData(input.token_in, input.token_out);
      
      // 2. Run detection algorithms
      const sandwichRisk = detectSandwich(input, mempoolData);
      const frontRunRisk = detectFrontRun(input, mempoolData);
      
      // 3. Calculate overall risk score
      const riskScore = Math.max(sandwichRisk.score, frontRunRisk.score);
      const attackType = riskScore === sandwichRisk.score ? sandwichRisk.type : frontRunRisk.type;
      
      // 4. Estimate potential loss
      const estimatedLoss = calculatePotentialLoss(input, riskScore);
      
      // 5. Generate protection suggestions
      const suggestions = generateProtectionSuggestions(riskScore, attackType);
      
      // 6. Return results
      return {
        output: {
          risk_score: riskScore,
          attack_type: attackType,
          risk_level: getRiskLevel(riskScore),
          estimated_loss_usd: estimatedLoss,
          similar_attacks_found: mempoolData.similarAttacks,
          protection_suggestions: suggestions,
          details: {
            mempool_position: mempoolData.position,
            gas_price_percentile: mempoolData.gasPercentile,
            competing_txs: mempoolData.competingTxs.length,
            block_time_estimate: mempoolData.blockTimeEstimate
          }
        },
        usage: { total_tokens: 1 } // Flat fee, not token-based
      };
      
    } catch (error) {
      console.error('MEV scan error:', error);
      return {
        output: {
          error: 'Failed to scan transaction',
          message: error.message
        },
        usage: { total_tokens: 0 }
      };
    }
  }
});

export default app;
```

### Environment Variables (.env)
```bash
# Blockchain Data
BLOCKNATIVE_API_KEY=your_key_here
ETHERSCAN_API_KEY=your_key_here
INFURA_PROJECT_ID=your_key_here

# X402 Payment
PAY_TO_WALLET=0x992920386E3D950BC260f99C81FDA12419eD4594
FACILITATOR_URL=https://facilitator.daydreams.systems
PAYMENT_NETWORK=base
PAYMENT_AMOUNT=0.10
PAYMENT_CURRENCY=USDC

# Server
PORT=3000
NODE_ENV=production
```

### Dependencies (package.json)
```json
{
  "name": "mev-protection-scanner",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/agent.js",
    "dev": "node --watch src/agent.js",
    "test": "node --test"
  },
  "dependencies": {
    "@lucid-dreams/agent-kit": "^0.2.22",
    "zod": "^3.22.4",
    "ethers": "^6.9.0",
    "better-sqlite3": "^9.2.2",
    "node-fetch": "^3.3.2",
    "dotenv": "^16.3.1"
  }
}
```

## Acceptance Criteria

### Must Have:
1. ✅ Detects sandwich attacks with 90%+ accuracy (test against historical data)
2. ✅ Detects front-running with 80%+ accuracy
3. ✅ Response time < 3 seconds per scan
4. ✅ False positive rate < 10%
5. ✅ X402 payment integration working ($0.10/scan)
6. ✅ Deployed on Railway with public URL
7. ✅ Clear risk scoring (0-100 scale)
8. ✅ Actionable protection suggestions

### Nice to Have:
- Historical attack database (learn from past attacks)
- Support for multiple DEXs (Uniswap v2/v3, Sushiswap, Curve)
- Gas price optimization recommendations
- Telegram/Discord webhook alerts
- API rate limiting (prevent abuse)

## Testing Strategy

### Unit Tests
```javascript
// Test sandwich detection
describe('Sandwich Detection', () => {
  test('detects obvious sandwich with front + back runner', () => {
    const userTx = { gasPrice: 50, amount: 1000, tokenPair: 'ETH/USDC' };
    const mempool = [
      { gasPrice: 100, amount: 5000, tokenPair: 'ETH/USDC' }, // Front-runner
      { gasPrice: 25, amount: 5000, tokenPair: 'ETH/USDC' }   // Back-runner
    ];
    
    const result = detectSandwich(userTx, mempool);
    expect(result.risk).toBe('high');
    expect(result.score).toBeGreaterThan(80);
  });
});
```

### Integration Tests
```javascript
// Test full scan workflow
describe('Full MEV Scan', () => {
  test('end-to-end scan returns valid results', async () => {
    const input = {
      token_in: 'USDC',
      token_out: 'ETH',
      amount_in: '1000',
      dex: 'uniswap-v2'
    };
    
    const result = await scanTransaction(input);
    
    expect(result.risk_score).toBeGreaterThanOrEqual(0);
    expect(result.risk_score).toBeLessThanOrEqual(100);
    expect(result.protection_suggestions).toBeInstanceOf(Array);
    expect(result.protection_suggestions.length).toBeGreaterThan(0);
  });
});
```

### Validation Against Historical Data
```javascript
// Use known sandwich attacks from blockchain history
const knownAttacks = [
  {
    txHash: '0x123...',
    block: 15000000,
    expectedRisk: 'high',
    expectedScore: 85
  },
  // ... more known attacks
];

knownAttacks.forEach(attack => {
  test(`detects known attack ${attack.txHash}`, async () => {
    const result = await scanHistoricalTx(attack.txHash);
    expect(result.risk_level).toBe(attack.expectedRisk);
    expect(result.risk_score).toBeCloseTo(attack.expectedScore, -5); // Within 5 points
  });
});
```

## Performance Requirements

### Response Time
- **Target:** < 3 seconds per scan
- **Max acceptable:** 5 seconds
- **Optimization:** Cache mempool data for 2-3 seconds, concurrent API calls

### Throughput
- **Target:** 100 scans/minute
- **Database:** SQLite with indexes on frequently queried fields
- **Caching:** Redis for mempool data (optional, if needed)

### Cost Optimization
- **Blocknative free tier:** 1,000 requests/month (enough for MVP)
- **Etherscan free tier:** 5 calls/second (backup data source)
- **Railway free tier:** $5 credit/month (upgrade to $5-20/mo when needed)

## Deployment

### Railway Setup
```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Initialize project
railway init

# 4. Set environment variables
railway variables set BLOCKNATIVE_API_KEY=...
railway variables set PAY_TO_WALLET=...

# 5. Deploy
railway up
```

### Health Check Endpoint
```javascript
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});
```

## Monitoring & Alerts

### Metrics to Track
- Scans per day
- Average risk score
- Most common attack types
- Revenue (scans × $0.10)
- Error rate
- Response time p50/p95/p99

### Logging
```javascript
// Structured logging for analytics
console.log(JSON.stringify({
  timestamp: Date.now(),
  event: 'scan_completed',
  risk_score: result.risk_score,
  attack_type: result.attack_type,
  response_time_ms: responseTime,
  payment_received: true
}));
```

## Marketing & Distribution

### Target Audiences
1. **DeFi Traders** (primary)
   - Reddit: r/CryptoTechnology, r/ethereum, r/defi
   - Discord: Uniswap, Curve, DeFi servers
   - Telegram: Trading groups

2. **MEV Researchers** (secondary)
   - Twitter: Tag @bertcmiller, @mevprofessor, @fifikobayashi
   - Flashbots Discord

3. **Wallet Developers** (partnership)
   - Integrate into MetaMask, Rabby, Rainbow

### Launch Plan
**Day 1:** Deploy + test
**Day 2:** Post to Reddit r/CryptoTechnology with demo
**Day 3:** Tweet with demo video, tag MEV researchers
**Day 4-7:** Respond to feedback, iterate
**Week 2:** Partner outreach to wallet teams

## Future Enhancements (v2)

1. **Real-time alerts:** Webhook notifications for high-risk transactions
2. **Batch scanning:** Upload CSV of pending transactions
3. **Historical analysis:** "How much MEV did I lose last month?"
4. **Auto-protection:** Automatically submit via Flashbots if high risk
5. **Cross-chain support:** Polygon, Arbitrum, Optimism, BSC
6. **Browser extension:** Scan before MetaMask confirms transaction

## Success Metrics

### Week 1
- 50+ scans
- $5+ revenue
- 100+ Twitter impressions

### Month 1
- 500+ scans
- $50+ revenue
- 500+ Twitter followers
- Featured in 1-2 DeFi newsletters

### Month 3
- 3,000+ scans
- $300+ revenue
- 2,000+ Twitter followers
- Partnership with 1 wallet provider

## Notes

- **Focus on accuracy over speed** - False positives erode trust
- **Clear communication** - Risk scores must be easy to understand
- **Actionable suggestions** - Every scan should tell users what to DO
- **Build trust** - Show detection methodology, cite sources
- **Iterate fast** - Launch MVP, improve based on user feedback

## Build Priority

1. **Core detection** (Day 1): Sandwich + front-run detection with Etherscan fallback
2. **X402 payments** (Day 1): Must work before launch
3. **Protection suggestions** (Day 1): Basic recommendations
4. **Deployment** (Day 1): Get it live
5. **Historical data** (Day 2): Improve accuracy with past attacks
6. **Blocknative integration** (Day 3): Upgrade to real-time mempool data
7. **UI polish** (Week 2): Better error messages, examples

---

**Start with MVP. Ship fast. Iterate based on real usage.**