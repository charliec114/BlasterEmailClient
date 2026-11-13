import { randomUUID } from 'crypto'
import { getDb } from '../db'
import type { ComposeDraft } from '@shared/types'

export interface QueuedDraft {
  id: string
  draft: ComposeDraft
  createdAt: string
}

interface Row {
  id: string
  draft_json: string
  created_at: string
}

function toQueued(row: Row): QueuedDraft {
  return { id: row.id, draft: JSON.parse(row.draft_json) as ComposeDraft, createdAt: row.created_at }
}

// Cola persistente de borradores pedidos por el servidor MCP: sobrevive a cerrar la app y a
// que ya haya un redactor abierto. La UI los va tomando de a uno.
export function enqueueDraft(draft: ComposeDraft): QueuedDraft {
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  getDb()
    .prepare('INSERT INTO mcp_draft_queue (id, draft_json, created_at) VALUES (?, ?, ?)')
    .run(id, JSON.stringify(draft), createdAt)
  return { id, draft, createdAt }
}

export function listQueuedDrafts(): QueuedDraft[] {
  const rows = getDb().prepare('SELECT * FROM mcp_draft_queue ORDER BY created_at ASC, rowid ASC').all() as Row[]
  return rows.map(toQueued)
}

// Saca y devuelve el borrador más antiguo (null si la cola está vacía).
export function takeNextDraft(): ComposeDraft | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM mcp_draft_queue ORDER BY created_at ASC, rowid ASC LIMIT 1').get() as
    | Row
    | undefined
  if (!row) return null
  db.prepare('DELETE FROM mcp_draft_queue WHERE id = ?').run(row.id)
  return toQueued(row).draft
}

export function discardQueuedDraft(id: string): boolean {
  return getDb().prepare('DELETE FROM mcp_draft_queue WHERE id = ?').run(id).changes > 0
}
