import type Database from 'better-sqlite3'

const SUBJECT_PREFIX = /^\s*(re|rv|fwd|fw)\s*:\s*/i
const SUBJECT_FALLBACK_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export function normalizeSubject(subject: string): string {
  let normalized = subject.trim()
  while (SUBJECT_PREFIX.test(normalized)) {
    normalized = normalized.replace(SUBJECT_PREFIX, '').trim()
  }
  return normalized.toLowerCase()
}

interface ThreadKeyRow {
  thread_key: string
}

export interface ThreadableMessage {
  messageId: string
  inReplyTo: string | null
  references: string[]
}

// Busca en toda la cuenta (no solo en la carpeta actual) para que, por ejemplo,
// una respuesta guardada en "Sent" se una al mismo hilo que el mensaje original en INBOX.
export function computeThreadKey(
  db: Database.Database,
  accountId: string,
  message: ThreadableMessage,
  subjectNorm: string,
  currentDate: string,
  excludeId?: string
): string {
  const referenceCandidates = [message.inReplyTo, ...message.references].filter(
    (value): value is string => Boolean(value)
  )

  for (const candidateId of referenceCandidates) {
    const match = db
      .prepare(
        `SELECT thread_key FROM messages
         WHERE account_id = @accountId AND message_id = @candidateId
           AND (@excludeId IS NULL OR id != @excludeId)`
      )
      .get({ accountId, candidateId, excludeId: excludeId ?? null }) as ThreadKeyRow | undefined
    if (match) return match.thread_key
  }

  if (subjectNorm) {
    const cutoff = new Date(new Date(currentDate).getTime() - SUBJECT_FALLBACK_WINDOW_MS).toISOString()
    const match = db
      .prepare(
        `SELECT thread_key FROM messages
         WHERE account_id = @accountId AND subject_norm = @subjectNorm
           AND date >= @cutoff AND date <= @currentDate
           AND (@excludeId IS NULL OR id != @excludeId)
         ORDER BY date DESC LIMIT 1`
      )
      .get({ accountId, subjectNorm, cutoff, currentDate, excludeId: excludeId ?? null }) as ThreadKeyRow | undefined
    if (match) return match.thread_key
  }

  return message.messageId
}

// Recalcula thread_key para todos los mensajes de una cuenta con el algoritmo cross-folder.
// Corre después de cada sync: barato a esta escala y autocorrige datos ya sincronizados
// con una versión anterior del algoritmo (que agrupaba solo dentro de una misma carpeta).
export function rethreadAccount(db: Database.Database, accountId: string): void {
  const rows = db
    .prepare(
      `SELECT id, message_id, in_reply_to, refs_json, subject_norm, date
       FROM messages WHERE account_id = ? ORDER BY date ASC, id ASC`
    )
    .all(accountId) as {
    id: string
    message_id: string
    in_reply_to: string | null
    refs_json: string | null
    subject_norm: string
    date: string
  }[]

  for (const row of rows) {
    const message: ThreadableMessage = {
      messageId: row.message_id,
      inReplyTo: row.in_reply_to,
      references: row.refs_json ? JSON.parse(row.refs_json) : []
    }
    const threadKey = computeThreadKey(db, accountId, message, row.subject_norm, row.date, row.id)
    db.prepare('UPDATE messages SET thread_key = ? WHERE id = ?').run(threadKey, row.id)
  }
}
