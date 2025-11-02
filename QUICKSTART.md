# Quick Start Guide - MEV Protection Scanner

Get up and running in 5 minutes!

## Step 1: Install (1 minute)

```bash
# Navigate to project directory
cd mev-protection-scanner

# Install dependencies
npm install

# Initialize database
npm run db:init
```

✅ **Done!** All dependencies installed and database ready.

---

## Step 2: Configure (1 minute)

The scanner works out-of-the-box with default settings!

**Optional**: Add API keys for better accuracy

```bash
# Copy example environment file
cp .env.example .env

# Edit .env and add your keys (optional)
nano .env
```

API keys (all optional for MVP):
- **Blocknative**: Real-time mempool data
- **Etherscan**: Historical transaction data
- **Infura**: Ethereum RPC access

---

## Step 3: Test (1 minute)

Run the test script to verify everything works:

```bash
node test-scan.js
```

Expected output:
```
🧪 Testing MEV Protection Scanner...
✅ All tests completed successfully!
```

---

## Step 4: Start Server (1 minute)

```bash
npm start
```

Server runs on: `http://localhost:3000`

Check health: `curl http://localhost:3000/health`

---

## Step 5: Make Your First Scan (1 minute)

### Option A: Using curl

```bash
curl -X POST http://localhost:3000/api/v1/scan_transaction \
  -H "Content-Type: application/json" \
  -d '{
    "token_in": "USDC",
    "token_out": "ETH",
    "amount_in": "1000",
    "dex": "uniswap-v2"
  }'
```

### Option B: Using JavaScript

```javascript
const response = await fetch('http://localhost:3000/api/v1/scan_transaction', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token_in: 'USDC',
    token_out: 'ETH',
    amount_in: '1000',
    dex: 'uniswap-v2'
  })
});

const result = await response.json();
console.log('Risk Score:', result.risk_score);
console.log('Suggestions:', result.protection_suggestions);
```

---

## Understanding the Results

Your scan returns a JSON response with:

```json
{
  "risk_score": 45,           // 0-100 scale
  "attack_type": "front-run", // Type of attack detected
  "risk_level": "medium",     // low | medium | high | critical
  "estimated_loss_usd": 22.50,
  "protection_suggestions": [
    "⚠️ MEDIUM: Increase slippage tolerance to 1-2%",
    "✅ INFO: Monitor transaction status..."
  ]
}
```

### Risk Levels

- **0-39 (Low)**: ✅ Safe to proceed with normal settings
- **40-69 (Medium)**: ⚠️ Use caution, follow suggestions
- **70-84 (High)**: 🔴 Use Flashbots or wait
- **85-100 (Critical)**: 🚨 DO NOT SUBMIT - High MEV risk

---

## Common Use Cases

### 1. Before Trading
Scan your transaction before submitting to detect MEV risk

### 2. Analyzing Failed Transactions
Understand why a transaction was frontrun or sandwiched

### 3. Setting Optimal Gas
Get recommendations for gas prices to avoid MEV

### 4. Large Trades
Essential for trades over $1,000 - split if needed

---

## Next Steps

✅ **You're ready to go!** The scanner is running.

**To improve accuracy:**
1. Add Blocknative API key → Real-time mempool
2. Add Etherscan API key → Historical attack data
3. Add Infura key → Better blockchain access

**To deploy:**
```bash
# Deploy to Railway (free tier available)
railway init
railway up
```

**To monitor:**
- Logs: Check console for scan events
- Health: `curl http://localhost:3000/health`
- Database: `data/mev_attacks.db` (SQLite)

---

## Troubleshooting

### Port already in use?
```bash
# Change port in .env
PORT=3001 npm start
```

### Database errors?
```bash
# Reinitialize database
rm data/mev_attacks.db
npm run db:init
```

### Module not found?
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

---

## Support & Resources

- **Full Documentation**: See README.md
- **Examples**: See EXAMPLES.md
- **Test Script**: `node test-scan.js`
- **Spec**: See mev-scanner-spec.md

---

**That's it! You're protecting DeFi traders from MEV attacks.** 🛡️

Start scanning and iterate based on user feedback!
