import { DatabaseSync } from 'node:sqlite'
import { CATEGORY_NAMES } from '../services/classifier.ts'

export type Db = DatabaseSync
type Param = string | number | null

export function openDb(path: string): Db {
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      parent_category_id INTEGER,
      destination_path TEXT NOT NULL,
      is_custom INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      extensions TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY,
      filename TEXT NOT NULL,
      original_path TEXT NOT NULL,
      current_path TEXT NOT NULL UNIQUE,
      extension TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      modified_at INTEGER NOT NULL,
      hash TEXT,
      category_id INTEGER,
      confidence_score REAL,
      last_scanned_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS files_hash ON files(hash);
    CREATE INDEX IF NOT EXISTS files_size ON files(size);
    CREATE TABLE IF NOT EXISTS operations (
      id INTEGER PRIMARY KEY,
      operation_type TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS operation_items (
      id INTEGER PRIMARY KEY,
      operation_id INTEGER NOT NULL,
      file_id INTEGER NOT NULL,
      original_path TEXT NOT NULL,
      destination_path TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      setting_key TEXT NOT NULL UNIQUE,
      setting_value TEXT
    );
  `)
  const seed = db.prepare('INSERT OR IGNORE INTO categories (name, destination_path, is_custom, created_at) VALUES (?, ?, 0, ?)')
  for (const name of CATEGORY_NAMES) seed.run(name, name, Date.now())
  return db
}

export const all = <T>(db: Db, sql: string, ...p: Param[]) => db.prepare(sql).all(...p) as unknown as T[]
export const one = <T>(db: Db, sql: string, ...p: Param[]) => db.prepare(sql).get(...p) as unknown as T | undefined
export const run = (db: Db, sql: string, ...p: Param[]) => db.prepare(sql).run(...p)

export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export const getSetting = (db: Db, key: string) =>
  one<{ setting_value: string | null }>(db, 'SELECT setting_value FROM settings WHERE setting_key = ?', key)?.setting_value ?? null
export const setSetting = (db: Db, key: string, value: string) =>
  run(db, 'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value', key, value)
