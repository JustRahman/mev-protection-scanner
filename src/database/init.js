import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '../../data/mev_attacks.db');

export function initDatabase() {
  const db = new Database(dbPath);

  // Create mev_attacks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS mev_attacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_number INTEGER,
      attacker_address TEXT,
      victim_address TEXT,
      token_pair TEXT,
      profit_usd REAL,
      attack_type TEXT,
      timestamp INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  // Create indexes for better query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_token_pair ON mev_attacks(token_pair);
    CREATE INDEX IF NOT EXISTS idx_attacker ON mev_attacks(attacker_address);
    CREATE INDEX IF NOT EXISTS idx_timestamp ON mev_attacks(timestamp);
    CREATE INDEX IF NOT EXISTS idx_attack_type ON mev_attacks(attack_type);
  `);

  // Create mempool_cache table for caching recent mempool data
  db.exec(`
    CREATE TABLE IF NOT EXISTS mempool_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_pair TEXT,
      data TEXT,
      cached_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cache_token_pair ON mempool_cache(token_pair);
    CREATE INDEX IF NOT EXISTS idx_cache_time ON mempool_cache(cached_at);
  `);

  console.log('Database initialized successfully at:', dbPath);

  return db;
}

export function getDatabase() {
  return new Database(dbPath);
}

// Run initialization if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initDatabase();
}
