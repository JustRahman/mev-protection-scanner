# MIGRATE MEV SCANNER TO AGENT-KIT (LIKE BRIDGE-ROUTE-PINGER)

## PROBLEM

`server-enhanced.js` uses Express with manual payment verification that doesn't work with facilitator.

Bridge-route-pinger works because it uses agent-kit's automatic X402 payment handling.

## SOLUTION

Migrate MEV scanner to use agent-kit (like bridge-route-pinger) instead of Express.

---

## STEP 1: Update src/agent.js

**Reference file:** `bridge-route-pinger/src/agent.js` (user has this file)

**Task:** Modify `src/agent.js` to use bridge-route-pinger's payment configuration pattern.

**Key requirements:**
1. Change `createAgentApp()` to use two-parameter format (like bridge)
2. First parameter: `{ name, version, description }`
3. Second parameter: `{ config: { payments: {...} }, useConfigPayments: true }`
4. Keep all existing detection logic, imports, and handler code
5. Only change the agent initialization at the top

**Bridge uses:**
```
createAgentApp(
  { name, version, description },
  { config: { payments: {...} }, useConfigPayments: true }
)
```

**Current MEV scanner uses (wrong):**
```
createAgentApp({
  name, version, description,
  payments: { enabled: true, ... }
})
```

Fix this to match bridge format exactly.

---

## STEP 2: Create src/index.js

**Reference file:** `bridge-route-pinger/src/index.js` (user has this file)

**Task:** Create new file `src/index.js` that starts the agent server.

**Requirements:**
1. Copy bridge-route-pinger's `src/index.js` structure
2. Import agent from './agent.js'
3. Use @hono/node-server's `serve()` function
4. Update console log messages for MEV scanner (not bridge)
5. Keep PORT handling, manifest URL, and payment info logs

---

## STEP 3: Update package.json

**Task:** Modify package.json scripts and dependencies.

**Changes needed:**
1. Add dependency: `"@hono/node-server": "^1.19.5"`
2. Change start script from `"node server-enhanced.js"` to `"node src/index.js"`
3. Keep all other dependencies and scripts

---

## STEP 4: Install dependencies

After changes, run:
```bash
npm install
```

---

## STEP 5: Test locally

**Start server:**
```bash
npm start
```

**Expected output:**
- "🛡️ MEV Protection Scanner Agent"
- "✅ X402 payments handled automatically by @lucid-dreams/agent-kit"
- Server running on port 3000

**Test without payment (should return 402):**
```bash
curl -X POST http://localhost:3000/entrypoints/scan_transaction/invoke \
  -H "Content-Type: application/json" \
  -d '{"input":{"token_in":"USDC","token_out":"ETH","amount_in":"1000","dex":"uniswap-v2"}}'
```

Should return HTTP 402 with proper X402 format.

**Test with payment (update test-mev-payment.js URL):**

Change URL in test file to:
```javascript
const url = "http://localhost:3000/entrypoints/scan_transaction/invoke";
```

Then run:
```bash
node test-mev-payment.js
```

Should return HTTP 200 with MEV scan results (if wallet has USDC).

---

## SUCCESS CRITERIA

✅ Server starts without errors
✅ Returns 402 without X-PAYMENT header
✅ 402 response matches bridge-route-pinger format exactly
✅ Payment test works (if USDC available)
✅ Endpoint: `/entrypoints/scan_transaction/invoke` (not `/api/v1/scan_transaction`)
✅ Manifest available at: `/.well-known/agent.json`

---

## FILES TO MODIFY

1. `src/agent.js` - Update createAgentApp() call to match bridge format
2. `src/index.js` - Create new file (copy structure from bridge)
3. `package.json` - Update scripts and add @hono/node-server

---

## FILES TO KEEP UNCHANGED

Keep all existing detection logic:
- `src/detectors/*`
- `src/services/*`
- `src/utils/*`
- `src/database/*`

These don't need changes - only the server startup changes.

---

## CRITICAL NOTES

- Agent-kit handles ALL X402 payment logic automatically
- No manual facilitator verification code needed
- Payment verification happens BEFORE handler() is called
- If payment invalid, agent-kit returns 402 automatically
- If payment valid, handler() executes and returns results
- This is why bridge works and server-enhanced.js doesn't

---

## AFTER MIGRATION

**Old endpoints (Express):**
- `POST /api/v1/scan_transaction` ❌

**New endpoints (agent-kit):**
- `POST /entrypoints/scan_transaction/invoke` ✅
- `GET /.well-known/agent.json` ✅ (auto-generated)

Update any documentation/test files to use new endpoint path.