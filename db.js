// Code refactoring JHKim w/ Claude  2026-04-15

const Database = require('better-sqlite3');
const db = new Database('./server_logs.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS server_status (
    server_id  TEXT PRIMARY KEY,
    in_use     INTEGER DEFAULT 0,
    user_id    TEXT,
    username   TEXT,
    memo       TEXT,
    started_at TEXT
  );
  CREATE TABLE IF NOT EXISTS usage_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT,
    user_id   TEXT,
    username  TEXT,
    action    TEXT,
    memo      TEXT,
    ts        TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', '+9 hours'))
  );
`);

// group_name 컬럼 마이그레이션
const cols = db.prepare('PRAGMA table_info(server_status)').all().map(c => c.name);
if (!cols.includes('group_name'))
  db.exec(`ALTER TABLE server_status ADD COLUMN group_name TEXT DEFAULT 'internal'`);

// hansung1 → hanshin1 이름 수정
db.prepare(`UPDATE server_status SET server_id='hanshin1' WHERE server_id='hansung1'`).run();

// 서버 초기 데이터
db.exec(`
  INSERT OR IGNORE INTO server_status (server_id, group_name) VALUES
    ('server1','internal'),('server2','internal'),('server3','internal'),
    ('server4','internal'),('server5','internal'),('server6','internal'),
    ('koran1','external'),('hanshin1','external');
`);

// fix: one-time migration — convert existing UTC timestamps to KST  2026-04-16 JHKim
// root cause: table was created with datetime('now','localtime') on UTC server
db.exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)`);
if (!db.prepare(`SELECT name FROM _migrations WHERE name='ts_utc_to_kst'`).get()) {
  db.prepare(`UPDATE usage_log SET ts = strftime('%Y-%m-%d %H:%M:%S', ts, '+9 hours')`).run();
  db.prepare(`INSERT INTO _migrations (name) VALUES ('ts_utc_to_kst')`).run();
  console.log('[DB] migrated usage_log timestamps UTC → KST');
}

// 30일 이상 된 로그 정리
function pruneOldLogs() {
  const { changes } = db.prepare(
    `DELETE FROM usage_log WHERE ts < strftime('%Y-%m-%d %H:%M:%S', 'now', '+9 hours', '-30 days')`
  ).run();
  if (changes > 0) console.log(`[DB] pruned ${changes} old rows`);
}

pruneOldLogs();
setInterval(pruneOldLogs, 24 * 60 * 60 * 1000);

module.exports = db;
