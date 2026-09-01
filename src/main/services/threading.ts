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
  subject: string
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

  // El fallback por asunto sólo tiene sentido para respuestas/reenvíos (el cliente de origen
  // no mandó In-Reply-To/References pero sí prefijó "Re:"/"Fwd:"). Si el asunto es nuevo (sin
  // prefijo), no hay que unirlo a un hilo viejo con el mismo texto — si no, dos conversaciones
  // sin relación que casualmente comparten asunto (ej: mails de prueba tipo "hola mundo")
  // terminan fusionadas, y el hilo viejo salta arriba de todo con la fecha del mensaje nuevo.
  if (subjectNorm && SUBJECT_PREFIX.test(message.subject)) {
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
// Corre solo cuando llegó mail nuevo (ver syncService) — autocorrige datos ya sincronizados
// con una versión anterior del algoritmo (que agrupaba solo dentro de una misma carpeta).
// Todo el barrido va en una sola transacción: sin esto, cada UPDATE hace su propio commit
// (fsync/checkpoint de WAL incluido), lo que en una cuenta de miles de mensajes bloquea el
// proceso principal — y con él, toda la ventana — el tiempo suficiente como para que el SO
// muestre el diálogo de "no responde".
export function rethreadAccount(db: Database.Database, accountId: string): void {
  const rows = db
    .prepare(
      `SELECT id, message_id, in_reply_to, refs_json, subject, subject_norm, date
       FROM messages WHERE account_id = ? ORDER BY date ASC, id ASC`
    )
    .all(accountId) as {
    id: string
    message_id: string
    in_reply_to: string | null
    refs_json: string | null
    subject: string
    subject_norm: string
    date: string
  }[]

  const updateThreadKey = db.prepare('UPDATE messages SET thread_key = ? WHERE id = ?')

  const applyAll = db.transaction(() => {
    for (const row of rows) {
      const message: ThreadableMessage = {
        messageId: row.message_id,
        inReplyTo: row.in_reply_to,
        references: row.refs_json ? JSON.parse(row.refs_json) : [],
        subject: row.subject
      }
      const threadKey = computeThreadKey(db, accountId, message, row.subject_norm, row.date, row.id)
      updateThreadKey.run(threadKey, row.id)
    }
  })

  applyAll()
}
