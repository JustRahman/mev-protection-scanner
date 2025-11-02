import { serve } from '@hono/node-server';
import agent from './agent.js';

const PORT = process.env.PORT || 3000;

console.log('');
console.log('🛡️  MEV Protection Scanner Agent');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('📡 Agent name: mev-protection-scanner');
console.log('📦 Version: 1.0.0');
console.log('');
console.log('💰 X402 Payment Configuration:');
console.log(`   Network: ${process.env.PAYMENT_NETWORK || 'base'}`);
console.log(`   Amount: ${process.env.PAYMENT_AMOUNT || '0.10'} ${process.env.PAYMENT_CURRENCY || 'USDC'}`);
console.log(`   Wallet: ${process.env.PAY_TO_WALLET || '0x992920386E3D950BC260f99C81FDA12419eD4594'}`);
console.log(`   Facilitator: ${process.env.FACILITATOR_URL || 'https://facilitator.daydreams.systems'}`);
console.log('');
console.log('✅ X402 payments handled automatically by @lucid-dreams/agent-kit');
console.log('');
console.log('🚀 Starting server...');

serve({
  fetch: agent.app.fetch,
  port: PORT
}, (info) => {
  console.log('');
  console.log('✅ Server running successfully!');
  console.log('');
  console.log(`📡 Listening on: http://localhost:${info.port}`);
  console.log(`🔍 Scan endpoint: POST http://localhost:${info.port}/entrypoints/scan_transaction/invoke`);
  console.log(`📄 Manifest: GET http://localhost:${info.port}/.well-known/agent.json`);
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Ready to protect transactions from MEV attacks! 🛡️');
  console.log('');
});
