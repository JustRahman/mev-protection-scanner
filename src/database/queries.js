import { getDatabase } from './init.js';

export function recordMevAttack(attack) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO mev_attacks (
      block_number, attacker_address, victim_address,
      token_pair, profit_usd, attack_type, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  return stmt.run(
    attack.block_number,
    attack.attacker_address,
    attack.victim_address,
    attack.token_pair,
    attack.profit_usd,
    attack.attack_type,
    attack.timestamp
  );
}

export function getAttacksByTokenPair(tokenPair, limit = 100) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM mev_attacks
    WHERE token_pair = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  return stmt.all(tokenPair, limit);
}

export function getKnownAttackers(limit = 1000) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT attacker_address, COUNT(*) as attack_count, SUM(profit_usd) as total_profit
    FROM mev_attacks
    GROUP BY attacker_address
    ORDER BY attack_count DESC
    LIMIT ?
  `);

  return stmt.all(limit);
}

export function checkIfKnownAttacker(address) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM mev_attacks
    WHERE attacker_address = ?
  `);

  const result = stmt.get(address);
  return result.count > 0;
}

export function getRecentAttacks(hours = 24, limit = 100) {
  const db = getDatabase();
  const since = Math.floor(Date.now() / 1000) - (hours * 3600);

  const stmt = db.prepare(`
    SELECT * FROM mev_attacks
    WHERE timestamp > ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  return stmt.all(since, limit);
}

export function getCachedMempoolData(tokenPair, maxAgeSeconds = 3) {
  const db = getDatabase();
  const since = Math.floor(Date.now() / 1000) - maxAgeSeconds;

  const stmt = db.prepare(`
    SELECT data FROM mempool_cache
    WHERE token_pair = ? AND cached_at > ?
    ORDER BY cached_at DESC
    LIMIT 1
  `);

  const result = stmt.get(tokenPair, since);
  return result ? JSON.parse(result.data) : null;
}

export function cacheMempoolData(tokenPair, data) {
  const db = getDatabase();

  // Clean old cache entries first (older than 10 seconds)
  const cleanStmt = db.prepare(`
    DELETE FROM mempool_cache
    WHERE cached_at < ?
  `);
  cleanStmt.run(Math.floor(Date.now() / 1000) - 10);

  // Insert new cache entry
  const stmt = db.prepare(`
    INSERT INTO mempool_cache (token_pair, data)
    VALUES (?, ?)
  `);

  return stmt.run(tokenPair, JSON.stringify(data));
}
