// Kalıcı veri: SQLite. İşletmeler, kullanıcılar, ekranlar, cihazlar ve platform ayarları.
// İşletmenin içerik ayarları (eski db.json) tenants.data sütununda JSON olarak durur;
// böylece eski kodun veri yapısı aynen korunur. İleride PostgreSQL'e geçmek için yalnızca bu dosya değişir.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { DATA_DIR } = require('./config');

fs.mkdirSync(DATA_DIR, { recursive: true });
const sql = new Database(path.join(DATA_DIR, 'platform.db'));
sql.pragma('journal_mode = WAL');
sql.pragma('foreign_keys = ON');

sql.exec(`
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'pro',
  status TEXT NOT NULL DEFAULT 'trial',      -- trial | active | suspended
  trial_until INTEGER,
  paid_until INTEGER,
  phone TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created INTEGER NOT NULL,
  data TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass TEXT NOT NULL,
  role TEXT NOT NULL,                         -- super | owner | staff
  name TEXT DEFAULT '',
  created INTEGER NOT NULL,
  last_login INTEGER
);
CREATE TABLE IF NOT EXISTS screens (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  layout TEXT,
  sort INTEGER DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  screen_id TEXT REFERENCES screens(id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT DEFAULT '',
  agent TEXT DEFAULT '',
  created INTEGER NOT NULL,
  last_seen INTEGER
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
-- günlük kullanım sayaçları: oynatma sayısı/süresi, ekran açık kalma dakikası
CREATE TABLE IF NOT EXISTS stats (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day TEXT NOT NULL,             -- YYYY-MM-DD (işletme saat dilimi)
  kind TEXT NOT NULL,            -- play | sec | online
  key TEXT NOT NULL,             -- medya kimliği ya da cihaz kimliği
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day, kind, key)
);
-- R2'ye (S3 uyumlu depoya) gönderilmiş dosyalar
CREATE TABLE IF NOT EXISTS objects (
  tenant_id TEXT NOT NULL,
  file TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  uploaded INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, file)
);
`);

// sonradan eklenen sütunlar (eski veritabanları için)
const cols = tbl => new Set(sql.prepare(`PRAGMA table_info(${tbl})`).all().map(c => c.name));
const addCol = (tbl, col, def) => { if (!cols(tbl).has(col)) sql.exec(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def}`); };
addCol('tenants', 'org_id', 'TEXT');          // çoklu şube: aynı org_id'ye sahip işletmeler bir zincirin şubeleri
addCol('devices', 'status', 'TEXT');          // TV'nin son durum raporu (JSON)
addCol('devices', 'alerted', 'INTEGER DEFAULT 0');

const J = s => { try { return JSON.parse(s); } catch { return null; } };

const q = {
  tenantAll: sql.prepare('SELECT * FROM tenants ORDER BY created'),
  tenantGet: sql.prepare('SELECT * FROM tenants WHERE id = ?'),
  tenantIns: sql.prepare('INSERT INTO tenants (id, name, plan, status, trial_until, paid_until, phone, created, data) VALUES (@id, @name, @plan, @status, @trial_until, @paid_until, @phone, @created, @data)'),
  tenantData: sql.prepare('UPDATE tenants SET data = ? WHERE id = ?'),
  tenantDel: sql.prepare('DELETE FROM tenants WHERE id = ?'),
  userByName: sql.prepare('SELECT * FROM users WHERE username = ?'),
  userGet: sql.prepare('SELECT * FROM users WHERE id = ?'),
  usersOf: sql.prepare('SELECT id, username, role, name, created, last_login FROM users WHERE tenant_id = ? ORDER BY created'),
  userIns: sql.prepare('INSERT INTO users (id, tenant_id, username, pass, role, name, created) VALUES (@id, @tenant_id, @username, @pass, @role, @name, @created)'),
  userPass: sql.prepare('UPDATE users SET pass = ? WHERE id = ?'),
  userLogin: sql.prepare('UPDATE users SET last_login = ? WHERE id = ?'),
  userDel: sql.prepare('DELETE FROM users WHERE id = ? AND tenant_id = ?'),
  screensOf: sql.prepare('SELECT * FROM screens WHERE tenant_id = ? ORDER BY sort, created'),
  screenGet: sql.prepare('SELECT * FROM screens WHERE id = ?'),
  screenIns: sql.prepare('INSERT INTO screens (id, tenant_id, name, layout, sort, created) VALUES (@id, @tenant_id, @name, @layout, @sort, @created)'),
  screenDel: sql.prepare('DELETE FROM screens WHERE id = ? AND tenant_id = ?'),
  devicesOf: sql.prepare('SELECT id, screen_id, name, agent, created, last_seen, status FROM devices WHERE tenant_id = ? ORDER BY created'),
  deviceByHash: sql.prepare('SELECT * FROM devices WHERE token_hash = ?'),
  deviceIns: sql.prepare('INSERT INTO devices (id, tenant_id, screen_id, token_hash, name, agent, created, last_seen) VALUES (@id, @tenant_id, @screen_id, @token_hash, @name, @agent, @created, @created)'),
  deviceSeen: sql.prepare('UPDATE devices SET last_seen = ? WHERE id = ?'),
  deviceDel: sql.prepare('DELETE FROM devices WHERE id = ? AND tenant_id = ?'),
  deviceMove: sql.prepare('UPDATE devices SET screen_id = ? WHERE id = ? AND tenant_id = ?'),
  deviceRename: sql.prepare('UPDATE devices SET name = ? WHERE id = ? AND tenant_id = ?'),
  setGet: sql.prepare('SELECT value FROM settings WHERE key = ?'),
  statAdd: sql.prepare('INSERT INTO stats (tenant_id, day, kind, key, value) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant_id, day, kind, key) DO UPDATE SET value = value + excluded.value'),
  statRange: sql.prepare('SELECT day, kind, key, value FROM stats WHERE tenant_id = ? AND day >= ? ORDER BY day'),
  statAllRange: sql.prepare("SELECT day, kind, SUM(value) AS value FROM stats WHERE day >= ? AND kind IN ('online','play','qr','drop') GROUP BY day, kind"),
  statByTenant: sql.prepare("SELECT tenant_id, kind, SUM(value) AS value FROM stats WHERE day >= ? AND kind IN ('online','play','qr','drop','dropsec') GROUP BY tenant_id, kind"),
  statPurge: sql.prepare('DELETE FROM stats WHERE day < ?'),
  objGet: sql.prepare('SELECT * FROM objects WHERE tenant_id = ? AND file = ?'),
  objOf: sql.prepare('SELECT * FROM objects WHERE tenant_id = ?'),
  objPut: sql.prepare('INSERT INTO objects (tenant_id, file, size, uploaded) VALUES (?, ?, ?, ?) ON CONFLICT(tenant_id, file) DO UPDATE SET size = excluded.size, uploaded = excluded.uploaded'),
  objDel: sql.prepare('DELETE FROM objects WHERE tenant_id = ? AND file = ?'),
  objTotals: sql.prepare('SELECT COUNT(*) n, COALESCE(SUM(size), 0) bytes FROM objects'),
  orgTenants: sql.prepare('SELECT id, name FROM tenants WHERE org_id = ? ORDER BY created'),
  deviceStatus: sql.prepare('UPDATE devices SET status = ? WHERE id = ?'),
  deviceAlerted: sql.prepare('UPDATE devices SET alerted = ? WHERE id = ?'),
  devicesAll: sql.prepare('SELECT id, tenant_id, name, agent, created, last_seen, status, alerted FROM devices'),
  setPut: sql.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
};

module.exports = {
  sql, q, J,
  setting(key, def = '') { const r = q.setGet.get(key); return r ? r.value : def; },
  setSetting(key, value) { q.setPut.run(key, String(value ?? '')); },
  updateTenant(id, fields) {
    const allowed = ['name', 'plan', 'status', 'trial_until', 'paid_until', 'phone', 'note', 'org_id'];
    const keys = Object.keys(fields).filter(k => allowed.includes(k));
    if (!keys.length) return;
    sql.prepare(`UPDATE tenants SET ${keys.map(k => k + ' = @' + k).join(', ')} WHERE id = @id`).run({ ...fields, id });
  },
  updateScreen(id, tenantId, fields) {
    const keys = Object.keys(fields).filter(k => ['name', 'layout', 'sort'].includes(k));
    if (!keys.length) return;
    sql.prepare(`UPDATE screens SET ${keys.map(k => k + ' = @' + k).join(', ')} WHERE id = @id AND tenant_id = @tenant_id`).run({ ...fields, id, tenant_id: tenantId });
  },
};
