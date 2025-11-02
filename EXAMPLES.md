# MEV Protection Scanner - Usage Examples

## Example 1: Safe Transaction (Low Risk)

**Scenario**: Small USDC to ETH swap on Uniswap

```bash
curl -X POST http://localhost:3000/api/v1/scan_transaction \
  -H "Content-Type: application/json" \
  -d '{
    "token_in": "USDC",
    "token_out": "ETH",
    "amount_in": "100",
    "dex": "uniswap-v2"
  }'
```

**Expected Result**:
- Risk Score: 10-30 (Low)
- Attack Type: none
- Suggestions: Use standard settings

---

## Example 2: Risky Transaction (High Risk)

**Scenario**: Large ETH to USDC swap during peak hours

```bash
curl -X POST http://localhost:3000/api/v1/scan_transaction \
  -H "Content-Type: application/json" \
  -d '{
    "token_in": "ETH",
    "token_out": "USDC",
    "amount_in": "50",
    "dex": "uniswap-v3",
    "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
  }'
```

**Expected Result**:
- Risk Score: 60-80 (High)
- Attack Type: sandwich or front-run
- Suggestions: Use Flashbots, increase gas, split trade

---

## Example 3: Critical Risk

**Scenario**: Very large trade in illiquid token pair

```bash
curl -X POST http://localhost:3000/api/v1/scan_transaction \
  -H "Content-Type: application/json" \
  -d '{
    "token_in": "USDC",
    "token_out": "RARE_TOKEN",
    "amount_in": "100000",
    "dex": "uniswap-v2"
  }'
```

**Expected Result**:
- Risk Score: 85-100 (Critical)
- Attack Type: sandwich
- Emergency Warning: DO NOT SUBMIT
- Suggestions: Use private RPC, wait, split into many transactions

---

## Example 4: With Transaction Hash

**Scenario**: Analyze a specific pending transaction

```bash
curl -X POST http://localhost:3000/api/v1/scan_transaction \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_hash": "0x1234567890abcdef...",
    "token_in": "WETH",
    "token_out": "USDT",
    "amount_in": "5",
    "dex": "sushiswap"
  }'
```

---

## Example 5: Curve Stable Swap (Lower MEV Risk)

**Scenario**: Stablecoin swap on Curve

```bash
curl -X POST http://localhost:3000/api/v1/scan_transaction \
  -H "Content-Type: application/json" \
  -d '{
    "token_in": "USDC",
    "token_out": "DAI",
    "amount_in": "10000",
    "dex": "curve"
  }'
```

**Expected Result**:
- Risk Score: 15-35 (Low-Medium)
- Note: Curve stable swaps have lower MEV risk
- Suggestions: Standard settings, Curve is generally safer

---

## Understanding the Response

### Risk Score Breakdown

```
0-39:   Low Risk       ✅ Safe to proceed
40-69:  Medium Risk    ⚠️  Use caution
70-84:  High Risk      🔴 Use protection
85-100: Critical Risk  🚨 DO NOT SUBMIT
```

### Attack Types

- **none**: No MEV attack detected
- **sandwich**: Front-run + back-run pattern detected
- **front-run**: Competing transactions with higher gas
- **copycat-frontrun**: Exact copy of your transaction with higher gas

### Protection Suggestions Priority

1. **CRITICAL**: Immediate action required
2. **HIGH**: Strongly recommended
3. **MEDIUM**: Consider implementing
4. **INFO**: Good to know

---

## Integration Examples

### JavaScript/Node.js

```javascript
import fetch from 'node-fetch';

async function scanTransaction(txParams) {
  const response = await fetch('http://localhost:3000/api/v1/scan_transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(txParams)
  });

  const result = await response.json();

  if (result.risk_score >= 85) {
    console.log('🚨 CRITICAL RISK - DO NOT SUBMIT');
    console.log('Emergency:', result.emergency);
  } else if (result.risk_score >= 70) {
    console.log('🔴 HIGH RISK - Use protection');
  } else {
    console.log('✅ Safe to proceed');
  }

  return result;
}

// Usage
const result = await scanTransaction({
  token_in: 'USDC',
  token_out: 'ETH',
  amount_in: '1000',
  dex: 'uniswap-v2'
});
```

### Python

```python
import requests

def scan_transaction(tx_params):
    response = requests.post(
        'http://localhost:3000/api/v1/scan_transaction',
        json=tx_params
    )
    return response.json()

# Usage
result = scan_transaction({
    'token_in': 'USDC',
    'token_out': 'ETH',
    'amount_in': '1000',
    'dex': 'uniswap-v2'
})

print(f"Risk Score: {result['risk_score']}")
print(f"Attack Type: {result['attack_type']}")
```

### Web3.js Integration

```javascript
import Web3 from 'web3';
import fetch from 'node-fetch';

async function safeSend(tx) {
  // Scan before sending
  const scan = await fetch('http://localhost:3000/api/v1/scan_transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token_in: tx.tokenIn,
      token_out: tx.tokenOut,
      amount_in: tx.amount,
      dex: 'uniswap-v2'
    })
  });

  const result = await scan.json();

  if (result.risk_score >= 85) {
    throw new Error('Transaction too risky - use Flashbots instead');
  }

  if (result.risk_score >= 70) {
    console.warn('High MEV risk - increasing gas price...');
    tx.gasPrice = Web3.utils.toWei('85', 'gwei'); // Increase gas
  }

  // Send transaction
  return web3.eth.sendTransaction(tx);
}
```

---

## Testing with Different Scenarios

### Test 1: No Competition (Safe)
```json
{
  "token_in": "USDC",
  "token_out": "ETH",
  "amount_in": "100",
  "dex": "uniswap-v2"
}
```
Expected: Low risk, no attack detected

### Test 2: Many Competitors (Medium Risk)
```json
{
  "token_in": "ETH",
  "token_out": "USDC",
  "amount_in": "5",
  "dex": "uniswap-v3"
}
```
Expected: Medium risk, front-running possible

### Test 3: Large Amount (High Risk)
```json
{
  "token_in": "USDC",
  "token_out": "ETH",
  "amount_in": "100000",
  "dex": "uniswap-v2"
}
```
Expected: High risk, sandwich attack likely

---

## Best Practices

1. **Always scan before large trades** (>$1000)
2. **Use Flashbots for high-risk transactions** (score > 70)
3. **Split large trades** if risk score > 60
4. **Monitor execution** after submitting
5. **Consider timing** - avoid peak hours for large trades
6. **Use limit orders** when possible for better MEV protection

---

## Common Issues

### Issue: "No competing transactions found"
**Cause**: Low network activity or using simulated data
**Solution**: This is normal in test environment; production will show real mempool data

### Issue: Risk score always low
**Cause**: Using free RPC without real mempool access
**Solution**: Add Blocknative API key for accurate mempool data

### Issue: Response time > 3 seconds
**Cause**: External API rate limits
**Solution**: Use caching or upgrade to paid API tier

---

## Support

For more examples and support:
- Documentation: README.md
- Test Script: `node test-scan.js`
- Health Check: `curl http://localhost:3000/health`
