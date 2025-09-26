import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const DB_FILE = process.env.DB_FILE || './data.db';

// Garante diretório do arquivo
const dir = path.dirname(DB_FILE);
if (dir && dir !== '.' && !fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(DB_FILE);

// Pragmas recomendados
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* =========================================================
   ESQUEMA BASE (para bancos novos)
   ========================================================= */
db.exec(`
  /* ---------- devices (status do device é legado) ---------- */
  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    brand TEXT,
    imei TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','banido')),
    is_disabled INTEGER NOT NULL DEFAULT 0, -- 0=ativo, 1=desativado
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  /* ---------- clients ---------- */
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#64748b',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );

  /* ---------- numbers (status por número) ---------- */
  CREATE TABLE IF NOT EXISTS numbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    client_id INTEGER,
    status TEXT NOT NULL DEFAULT 'ok'
      CHECK (status IN ('ok','banido','desconectado','livre')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
  );

  /* ---------- logs ---------- */
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER,
    number_id INTEGER,
    client_id INTEGER,
    type TEXT NOT NULL, -- 'device_created','device_status','number_added','number_deleted','number_client_set','number_status','client_created','client_updated','client_deleted'
    message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  /* ---------- settings (key/value JSON) ---------- */
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  /* ---------- Índices ---------- */
  CREATE INDEX IF NOT EXISTS idx_logs_device  ON logs(device_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_number  ON logs(number_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_numbers_client_id ON numbers(client_id);
  CREATE INDEX IF NOT EXISTS idx_numbers_status    ON numbers(status);
  CREATE INDEX IF NOT EXISTS idx_numbers_device    ON numbers(device_id);
  CREATE INDEX IF NOT EXISTS idx_numbers_phone     ON numbers(phone);

  /* unicidade por nome do aparelho (case-insensitive + trim) */
  CREATE UNIQUE INDEX IF NOT EXISTS uq_devices_name_norm
  ON devices (lower(trim(name)));
`);

/* =========================================================
   MIGRAÇÕES BRANDAS (para bancos antigos)
   - Todas dentro de try/catch para serem idempotentes.
   ========================================================= */

/* devices: colunas que podem faltar em bancos antigos */
try { db.exec(`ALTER TABLE devices ADD COLUMN is_disabled INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE devices ADD COLUMN note TEXT`); } catch {}

/* clients: updated_at pode faltar */
try { db.exec(`ALTER TABLE clients ADD COLUMN updated_at TEXT`); } catch {}

/* numbers: client_id/status podem faltar; índices idem */
try { db.exec(`ALTER TABLE numbers ADD COLUMN client_id INTEGER`); } catch {}
try { db.exec(`ALTER TABLE numbers ADD COLUMN status TEXT`); } catch {}
try { db.exec(`UPDATE numbers SET status='ok' WHERE status IS NULL;`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_numbers_client_id ON numbers(client_id)`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_numbers_status ON numbers(status)`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_numbers_device ON numbers(device_id)`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_numbers_phone ON numbers(phone)`); } catch {}

/* logs: índice por número pode faltar */
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_logs_number ON logs(number_id, created_at DESC)`); } catch {}

/* settings: garante existência (se banco é antigo) */
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
} catch {}

/* =========================================================
   Verifica se a tabela numbers tem o CHECK de 4 valores.
   Se o banco for antigo (somente 'ok','banido'), recria.
   ========================================================= */
(function ensureNumbersStatusHas4Values() {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='numbers'`).get();
  const sql = row?.sql || '';
  const hasNew = /CHECK\s*\(\s*status\s+IN\s*\('ok','banido','desconectado','livre'\)\s*\)/i.test(sql);
  const hasOld = /CHECK\s*\(\s*status\s+IN\s*\('ok','banido'\)\s*\)/i.test(sql);

  if (!hasNew && hasOld) {
    try {
      db.exec('BEGIN');
      db.exec(`
        CREATE TABLE numbers_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id INTEGER NOT NULL,
          phone TEXT NOT NULL UNIQUE,
          client_id INTEGER,
          status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','banido','desconectado','livre')),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
        );
      `);
      db.exec(`
        INSERT INTO numbers_new (id, device_id, phone, client_id, status, created_at)
        SELECT id, device_id, phone, client_id, COALESCE(status,'ok'), created_at
        FROM numbers;
      `);
      db.exec(`DROP TABLE numbers;`);
      db.exec(`ALTER TABLE numbers_new RENAME TO numbers;`);

      db.exec(`CREATE INDEX IF NOT EXISTS idx_numbers_client_id ON numbers(client_id);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_numbers_status    ON numbers(status);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_numbers_device    ON numbers(device_id);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_numbers_phone     ON numbers(phone);`);

      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('Falha migrando tabela numbers:', e);
    }
  }
})();
