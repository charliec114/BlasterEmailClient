import { randomUUID } from 'crypto'
import { getDb } from '../db'
import type { ComposeDraft, QueuedDraft } from '@shared/types'


interface Row {
  id: string
  draft_json: string
  created_at: string
}

function toQueued(row: Row): QueuedDraft {
  return { id: row.id, draft: JSON.parse(row.draft_json) as ComposeDraft, createdAt: row.created_at }
}

// Cola persistente de borradores pedidos por el servidor MCP: sobrevive a cerrar la app y a
// que ya haya un redactor abierto. La UI los lista en la sección Borradores; no se abren solos.
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

// Guarda los cambios hechos a un borrador que se abrió y se cerró sin enviar.
export function updateQueuedDraft(id: string, draft: ComposeDraft): boolean {
  const { queuedDraftId: _ignored, error: _error, ...clean } = draft
  return (
    getDb().prepare('UPDATE mcp_draft_queue SET draft_json = ? WHERE id = ?').run(JSON.stringify(clean), id).changes > 0
  )
}

export function discardQueuedDraft(id: string): boolean {
  return getDb().prepare('DELETE FROM mcp_draft_queue WHERE id = ?').run(id).changes > 0
}
