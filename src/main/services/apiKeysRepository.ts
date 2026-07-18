import { getDb } from '../db'
import { encryptSecret, decryptSecret } from './secretStorage'

export function setApiKey(provider: string, key: string): void {
  if (!key.trim()) {
    getDb().prepare('DELETE FROM api_keys WHERE provider = ?').run(provider)
    return
  }
  const enc = encryptSecret(key.trim())
  getDb()
    .prepare('INSERT INTO api_keys (provider, key_enc) VALUES (?, ?) ON CONFLICT(provider) DO UPDATE SET key_enc = excluded.key_enc')
    .run(provider, enc)
}

export function getApiKey(provider: string): string | null {
  const row = getDb().prepare('SELECT key_enc FROM api_keys WHERE provider = ?').get(provider) as
    | { key_enc: Buffer }
    | undefined
  return row ? decryptSecret(row.key_enc) : null
}

export function getApiKeyStatus(): Record<string, boolean> {
  const rows = getDb().prepare('SELECT provider FROM api_keys').all() as { provider: string }[]
  const status: Record<string, boolean> = {}
  for (const row of rows) status[row.provider] = true
  return status
}
