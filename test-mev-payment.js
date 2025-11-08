import { createSigner } from 'x402-fetch';
import { wrapFetchWithPayment } from 'x402-fetch';
import fetch from 'node-fetch';

const PRIVATE_KEY = "0x92f597b036614b50eefe4d029b9756f5370bb41fcc1b814e4c28494a0033a0f2";
const API_URL = "https://mev-protection-scanner-production.up.railway.app";
const NETWORK = "base";

async function testWithWrappedFetch() {
  console.log('🧪 Testing X402 Payment with wrapFetchWithPayment\n');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    // Step 1: Create signer
    console.log('💰 Step 1: Creating signer...');
    const signer = await createSigner(NETWORK, PRIVATE_KEY);
    const signerAddress = signer.account?.address || signer.address;
    console.log(`   Signer address: ${signerAddress}\n`);

    // Step 2: Wrap fetch with automatic payment handling
    console.log('🔄 Step 2: Wrapping fetch with payment handler...');
    const fetchWithPayment = wrapFetchWithPayment(
      fetch,
      signer,
      BigInt(100000), // Max 0.1 USDC (100000 base units)
    );
    console.log('   ✅ Payment-enabled fetch created\n');

    // Step 3: Make request - payment handled automatically
    console.log('🚀 Step 3: Making request (payment automatic)...');
    const url = `${API_URL}/entrypoints/scan_transaction/invoke`;
    const response = await fetchWithPayment(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: {
          token_in: "USDC",
          token_out: "ETH",
          amount_in: "1000",
          dex: "uniswap-v2"
        }
      })
    });

    console.log(`   Response status: ${response.status}\n`);

    // Step 4: Check results
    if (response.ok) {
      const data = await response.json();
      console.log('═══════════════════════════════════════════════════');
      console.log('✅ SUCCESS! Payment verified and bridge routes returned!\n');
      console.log('📊 BRIDGE ROUTES:\n');
      console.log(JSON.stringify(data, null, 2));
      console.log('\n═══════════════════════════════════════════════════');
      console.log('🎉 X402 wrapped fetch payment WORKS!\n');
    } else {
      const errorText = await response.text();
      console.log('❌ Request failed:');
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${errorText.substring(0, 200)}...`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

console.log('Starting wrapped fetch test...\n');
testWithWrappedFetch();
