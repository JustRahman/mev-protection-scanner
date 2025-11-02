# Deployment Guide - MEV Protection Scanner

## Running the Agent

The MEV Protection Scanner is built with `@lucid-dreams/agent-kit` v0.2.22. There are multiple ways to run it:

### Option 1: Direct Node Execution (Development)

```bash
# Initialize database
npm run db:init

# Start the agent
npm start
# or
node src/agent.js
```

The agent will initialize and be ready to handle requests via the agent-kit framework.

### Option 2: Using Agent-Kit CLI (Recommended)

If you have the agent-kit CLI installed:

```bash
# Install agent-kit CLI globally (if not already installed)
npm install -g @lucid-dreams/agent-kit

# Run the agent
agent-kit run src/agent.js
```

### Option 3: As a Module

Import and use the agent in your own application:

```javascript
import mevScanner from './src/agent.js';

// The agent is now running and accessible via agent-kit
```

## Environment Configuration

### Required Environment Variables

```bash
# X402 Payment Configuration (Required for production)
PAY_TO_WALLET=0x992920386E3D950BC260f99C81FDA12419eD4594
FACILITATOR_URL=https://facilitator.daydreams.systems
PAYMENT_NETWORK=base
PAYMENT_AMOUNT=0.10
PAYMENT_CURRENCY=USDC
```

### Optional API Keys (Improve Accuracy)

```bash
# Blockchain Data APIs
BLOCKNATIVE_API_KEY=your_key_here  # Real-time mempool data
ETHERSCAN_API_KEY=your_key_here    # Historical transaction data
INFURA_PROJECT_ID=your_key_here    # Ethereum RPC access
```

### Server Configuration

```bash
PORT=3000                          # Server port (default: 3000)
NODE_ENV=production                # Environment mode
```

## Deployment Platforms

### Railway (Recommended)

Railway provides easy deployment with built-in environment management.

#### Step 1: Install Railway CLI

```bash
npm install -g @railway/cli
```

#### Step 2: Login and Initialize

```bash
railway login
railway init
```

#### Step 3: Set Environment Variables

```bash
railway variables set PAY_TO_WALLET=0x992920386E3D950BC260f99C81FDA12419eD4594
railway variables set PAYMENT_AMOUNT=0.10
railway variables set PAYMENT_CURRENCY=USDC
railway variables set PAYMENT_NETWORK=base
railway variables set FACILITATOR_URL=https://facilitator.daydreams.systems

# Optional: Add API keys for better accuracy
railway variables set BLOCKNATIVE_API_KEY=your_key
railway variables set ETHERSCAN_API_KEY=your_key
railway variables set INFURA_PROJECT_ID=your_key
```

#### Step 4: Deploy

```bash
railway up
```

Your agent will be deployed and accessible via the Railway-provided URL.

#### Step 5: Monitor

```bash
# View logs
railway logs

# Check status
railway status
```

### Heroku

```bash
# Install Heroku CLI
brew install heroku/brew/heroku  # macOS
# or download from https://devcenter.heroku.com/articles/heroku-cli

# Login
heroku login

# Create app
heroku create mev-protection-scanner

# Set environment variables
heroku config:set PAY_TO_WALLET=0x992920386E3D950BC260f99C81FDA12419eD4594
heroku config:set PAYMENT_AMOUNT=0.10
heroku config:set PAYMENT_CURRENCY=USDC
heroku config:set PAYMENT_NETWORK=base

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

### Docker

#### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy source code
COPY . .

# Initialize database
RUN npm run db:init

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Start application
CMD ["npm", "start"]
```

#### Build and Run

```bash
# Build image
docker build -t mev-protection-scanner .

# Run container
docker run -d \
  -p 3000:3000 \
  -e PAY_TO_WALLET=0x992920386E3D950BC260f99C81FDA12419eD4594 \
  -e PAYMENT_AMOUNT=0.10 \
  -e PAYMENT_CURRENCY=USDC \
  -e PAYMENT_NETWORK=base \
  --name mev-scanner \
  mev-protection-scanner

# View logs
docker logs -f mev-scanner
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  mev-scanner:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PAY_TO_WALLET=0x992920386E3D950BC260f99C81FDA12419eD4594
      - PAYMENT_AMOUNT=0.10
      - PAYMENT_CURRENCY=USDC
      - PAYMENT_NETWORK=base
      - FACILITATOR_URL=https://facilitator.daydreams.systems
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

Run with: `docker-compose up -d`

### Render

1. Connect your GitHub repository
2. Create a new Web Service
3. Set build command: `npm install && npm run db:init`
4. Set start command: `npm start`
5. Add environment variables in the dashboard
6. Deploy

### Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch app
fly launch

# Set secrets
fly secrets set PAY_TO_WALLET=0x992920386E3D950BC260f99C81FDA12419eD4594
fly secrets set PAYMENT_AMOUNT=0.10
fly secrets set PAYMENT_CURRENCY=USDC

# Deploy
fly deploy

# View logs
fly logs
```

## Database Management

### SQLite Database

The scanner uses SQLite for caching and historical data.

**Location**: `data/mev_attacks.db`

### Backup Database

```bash
# Backup
cp data/mev_attacks.db data/mev_attacks_backup_$(date +%Y%m%d).db

# Restore
cp data/mev_attacks_backup_20250101.db data/mev_attacks.db
```

### Database Migrations

If you need to reset or update the database:

```bash
# Remove old database
rm data/mev_attacks.db

# Reinitialize
npm run db:init
```

## Monitoring & Logging

### View Logs

All scan events are logged in structured JSON format:

```json
{
  "timestamp": 1699999999,
  "event": "scan_completed",
  "risk_score": 75,
  "attack_type": "sandwich",
  "response_time_ms": 1250,
  "token_pair": "USDC/ETH"
}
```

### Health Check

Monitor your deployment with the health endpoint:

```bash
curl https://your-deployment-url.railway.app/health
```

Response:
```json
{
  "status": "healthy",
  "uptime": 86400,
  "timestamp": 1699999999,
  "version": "1.0.0"
}
```

### Uptime Monitoring

Use services like:
- UptimeRobot (free tier available)
- Pingdom
- StatusCake

Configure to ping `/health` every 5 minutes.

## Performance Optimization

### Caching

The scanner caches mempool data for 3 seconds to reduce API calls.

Adjust cache duration in `src/database/queries.js`:

```javascript
// Change maxAgeSeconds parameter
getCachedMempoolData(tokenPair, 5); // 5 second cache
```

### Rate Limiting

For production, add rate limiting to prevent abuse:

```bash
npm install express-rate-limit
```

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

### Database Optimization

SQLite performance is already optimized with indexes. For high volume:

1. **Periodic cleanup**:
```bash
# Clean old cache entries (older than 1 hour)
sqlite3 data/mev_attacks.db "DELETE FROM mempool_cache WHERE cached_at < strftime('%s', 'now') - 3600;"
```

2. **Vacuum database** (monthly):
```bash
sqlite3 data/mev_attacks.db "VACUUM;"
```

## Security Considerations

### API Keys

- Never commit `.env` file
- Use environment variables in production
- Rotate API keys regularly

### Database

- SQLite file permissions: `chmod 600 data/mev_attacks.db`
- Regular backups
- Don't expose database file publicly

### Payment Security

- Verify X402 payment signatures
- Use HTTPS for all production deployments
- Monitor for payment fraud

## Troubleshooting

### Database locked error

```bash
# Kill any processes using the database
lsof data/mev_attacks.db
kill -9 <PID>

# Reinitialize
npm run db:init
```

### Port already in use

```bash
# Find process using port 3000
lsof -ti:3000

# Kill it
kill -9 $(lsof -ti:3000)
```

### Out of memory

Increase Node.js memory:

```bash
node --max-old-space-size=4096 src/agent.js
```

Or update package.json:

```json
{
  "scripts": {
    "start": "node --max-old-space-size=4096 src/agent.js"
  }
}
```

## Scaling

### Horizontal Scaling

1. Use a shared database (PostgreSQL instead of SQLite)
2. Add Redis for caching
3. Deploy multiple instances behind load balancer

### Vertical Scaling

- Increase server resources (RAM, CPU)
- Use Node.js cluster mode
- Optimize database queries

## Cost Estimation

### Free Tier Deployment (Monthly)

- **Railway**: $5 credit/month (enough for MVP)
- **Heroku**: Free tier available
- **Render**: Free tier available
- **Fly.io**: Free allowance available

### API Costs

- **Blocknative**: Free tier (1,000 requests/month)
- **Etherscan**: Free tier (5 calls/second)
- **Infura**: Free tier (100k requests/day)

### Paid Tier (Est. $20-50/month)

- Hosting: $10-20/month
- Blocknative: $99/month (50k requests)
- Optional monitoring: $0-10/month

## Support

For deployment issues:
- Check logs first
- Review environment variables
- Verify database initialization
- Test with `node test-scan.js`

---

**Ready to deploy? Start with Railway for the easiest setup!**

```bash
railway login
railway init
railway up
```
