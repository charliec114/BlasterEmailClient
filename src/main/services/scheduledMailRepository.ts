import { randomUUID } from 'crypto'
import { getDb } from '../db'
import type { AttachmentRef, ScheduleMailInput, ScheduledMail, ScheduledMailStatus } from '@shared/types'

interface ScheduledMailRow {
  id: string
  account_id: string
  to_json: string
  cc_json: string
  bcc_json: string
  subject: string
  body_text: string
  body_html: string | null
  in_reply_to: string | null
  references_json: string | null
  attachments_json: string
  scheduled_for: string
  status: ScheduledMailStatus
  error: string | null
  created_at: string
  outbox: number
}

function rowToScheduledMail(row: ScheduledMailRow): ScheduledMail {
  return {
    id: row.id,
    accountId: row.account_id,
    to: JSON.parse(row.to_json) as string[],
    cc: JSON.parse(row.cc_json) as string[],
    bcc: JSON.parse(row.bcc_json) as string[],
    subject: row.subject,
    bodyText: row.body_text,
    bodyHtml: row.body_html ?? undefined,
    inReplyTo: row.in_reply_to ?? undefined,
    references: row.references_json ? (JSON.parse(row.references_json) as string[]) : undefined,
    attachments: JSON.parse(row.attachments_json) as AttachmentRef[],
    scheduledFor: row.scheduled_for,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    queuedOffline: row.outbox === 1
  }
}

export function scheduleMail(input: ScheduleMailInput, options: { outbox?: boolean } = {}): ScheduledMail {
  const db = getDb()
  const id = randomUUID()
  const createdAt = new Date().toISOString()

  db.prepare(
    `INSERT INTO scheduled_messages
      (id, account_id, to_json, cc_json, bcc_json, subject, body_text, body_html, in_reply_to, references_json, attachments_json, scheduled_for, status, created_at, outbox)
     VALUES (@id, @accountId, @to, @cc, @bcc, @subject, @bodyText, @bodyHtml, @inReplyTo, @references, @attachments, @scheduledFor, 'pending', @createdAt, @outbox)`
  ).run({
    id,
    accountId: input.accountId,
    to: JSON.stringify(input.to),
    cc: JSON.stringify(input.cc),
    bcc: JSON.stringify(input.bcc),
    subject: input.subject,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml ?? null,
    inReplyTo: input.inReplyTo ?? null,
    references: input.references ? JSON.stringify(input.references) : null,
    attachments: JSON.stringify(input.attachments),
    scheduledFor: input.scheduledFor,
    createdAt,
    outbox: options.outbox ? 1 : 0
  })

  return getScheduledMailById(id) as ScheduledMail
}

export function getScheduledMailById(id: string): ScheduledMail | null {
  const row = getDb().prepare('SELECT * FROM scheduled_messages WHERE id = ?').get(id) as ScheduledMailRow | undefined
  return row ? rowToScheduledMail(row) : null
}

export function listScheduledMail(): ScheduledMail[] {
  const rows = getDb()
    .prepare("SELECT * FROM scheduled_messages WHERE status != 'canceled' ORDER BY scheduled_for ASC")
    .all() as ScheduledMailRow[]
  return rows.map(rowToScheduledMail)
}

export function listDueScheduledMail(nowIso: string): ScheduledMail[] {
  const rows = getDb()
    .prepare("SELECT * FROM scheduled_messages WHERE status = 'pending' AND scheduled_for <= ?")
    .all(nowIso) as ScheduledMailRow[]
  return rows.map(rowToScheduledMail)
}

export function cancelScheduledMail(id: string): void {
  getDb().prepare("UPDATE scheduled_messages SET status = 'canceled' WHERE id = ? AND status IN ('pending', 'failed')").run(id)
}

// Reserva el envío de forma atómica: devuelve false si otro ciclo (o "enviar ahora") ya lo tomó o
// si se canceló mientras tanto. Evita que dos pasadas del watcher manden el mismo mensaje dos veces.
export function claimScheduledMail(id: string): boolean {
  return (
    getDb().prepare("UPDATE scheduled_messages SET status = 'sending' WHERE id = ? AND status IN ('pending', 'failed')").run(id)
      .changes > 0
  )
}

export function markScheduledMailSent(id: string): void {
  getDb().prepare("UPDATE scheduled_messages SET status = 'sent', error = NULL WHERE id = ?").run(id)
}

export function markScheduledMailFailed(id: string, error: string): void {
  getDb().prepare("UPDATE scheduled_messages SET status = 'failed', error = ? WHERE id = ?").run(error, id)
}

// Sin conexión: vuelve a 'pending' para que el watcher lo reintente cuando haya internet.
export function releaseScheduledMail(id: string, note: string): void {
  getDb().prepare("UPDATE scheduled_messages SET status = 'pending', error = ? WHERE id = ?").run(note, id)
}

// Si la app se cerró en medio de un envío no hay forma de saber si el servidor llegó a aceptarlo:
// reenviarlo automáticamente podría duplicarlo, así que se marca como fallido y se deja decidir.
export function failInterruptedScheduledMail(): void {
  getDb()
    .prepare(
      "UPDATE scheduled_messages SET status = 'failed', error = 'Se interrumpió mientras se enviaba. Revisá Enviados antes de reenviarlo.' WHERE status = 'sending'"
    )
    .run()
}
