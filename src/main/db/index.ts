import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database | null = null

function ensureColumn(database: Database.Database, table: string, column: string, definition: string): void {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!columns.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

export function getDb(): Database.Database {
  if (db) return db

  const dbPath = join(app.getPath('userData'), 'blaster.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL,
      protocol TEXT NOT NULL,
      color TEXT NOT NULL,
      incoming_host TEXT NOT NULL,
      incoming_port INTEGER NOT NULL,
      incoming_secure INTEGER NOT NULL,
      incoming_username TEXT NOT NULL,
      incoming_password_enc BLOB NOT NULL,
      outgoing_host TEXT NOT NULL,
      outgoing_port INTEGER NOT NULL,
      outgoing_secure INTEGER NOT NULL,
      outgoing_username TEXT NOT NULL,
      outgoing_password_enc BLOB NOT NULL,
      created_at TEXT NOT NULL
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      remote_path TEXT NOT NULL,
      display_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      last_synced_uid TEXT,
      last_synced_at TEXT,
      UNIQUE(account_id, remote_path)
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      folder_id TEXT NOT NULL,
      remote_uid TEXT NOT NULL,
      message_id TEXT NOT NULL,
      in_reply_to TEXT,
      refs_json TEXT,
      thread_key TEXT NOT NULL,
      subject TEXT NOT NULL,
      subject_norm TEXT NOT NULL,
      from_name TEXT,
      from_email TEXT,
      date TEXT NOT NULL,
      snippet TEXT NOT NULL,
      body_text TEXT NOT NULL,
      body_html TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      is_flagged INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(account_id, folder_id, remote_uid)
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_folder ON messages(folder_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(folder_id, thread_key)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(account_id, folder_id, message_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_account_thread ON messages(account_id, thread_key)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_account_message_id ON messages(account_id, message_id)`)

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  ensureColumn(db, 'accounts', 'signature_html', 'TEXT')
  ensureColumn(db, 'messages', 'to_json', 'TEXT')
  ensureColumn(db, 'messages', 'cc_json', 'TEXT')

  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      last_interaction_at TEXT NOT NULL,
      interaction_count INTEGER NOT NULL DEFAULT 1
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)`)

  db.exec(`
    CREATE TABLE IF NOT EXISTS thread_summaries (
      thread_key TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      last_message_date TEXT NOT NULL,
      generated_at TEXT NOT NULL
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT,
      size INTEGER NOT NULL,
      content BLOB NOT NULL
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id)`)

  ensureColumn(db, 'accounts', 'auth_type', "TEXT NOT NULL DEFAULT 'password'")
  ensureColumn(db, 'accounts', 'oauth_provider', 'TEXT')
  ensureColumn(db, 'accounts', 'oauth_refresh_token_enc', 'BLOB')

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      provider TEXT PRIMARY KEY,
      key_enc BLOB NOT NULL
    )
  `)

  return db
}
