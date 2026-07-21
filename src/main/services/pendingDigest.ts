import { getDb } from '../db'
import { extractAttachmentText } from './attachmentText'

export interface PendingDigestOptions {
  accountIds: string[]
  fromDate: string
  toDate: string
}

export interface PendingDigestThreadRef {
  accountId: string
  threadKey: string
  subject: string
}

export interface PendingDigestResult {
  text: string
  threadCount: number
  messageCount: number
  truncated: boolean
  threads: PendingDigestThreadRef[]
}

const MAX_TOTAL_CHARS = 60000
const MAX_MESSAGE_CHARS = 3000
const MAX_ATTACHMENTS = 25

interface MessageRow {
  id: string
  account_id: string
  thread_key: string
  message_id: string
  subject: string
  from_name: string | null
  from_email: string | null
  to_json: string | null
  date: string
  body_text: string
}

interface AttachmentRow {
  id: string
  message_id: string
  filename: string
  content_type: string | null
  content: Buffer
}

// Mismo criterio que mailRepository.dedupeByMessageId: Gmail expone el mismo mensaje en
// varias carpetas (INBOX + "Todos"), y para el digest del RAG no queremos que aparezca
// duplicado ni que cuente dos veces como "pendiente".
function dedupeByMessageId(rows: MessageRow[]): MessageRow[] {
  const byId = new Map<string, MessageRow>()
  for (const row of rows) {
    if (!byId.has(row.message_id)) byId.set(row.message_id, row)
  }
  return Array.from(byId.values())
}

function formatParticipants(json: string | null): string {
  if (!json) return ''
  try {
    const parsed = JSON.parse(json) as { name: string; email: string }[]
    return parsed.map((p) => (p.name && p.name !== p.email ? `${p.name} <${p.email}>` : p.email)).filter(Boolean).join(', ')
  } catch {
    return ''
  }
}

function formatFrom(name: string | null, email: string | null): string {
  if (name && email && name !== email) return `${name} <${email}>`
  return email || name || 'desconocido'
}

// Arma el "corpus" de texto que se le pasa como contexto al modelo para el apartado de
// Pendientes: junta los hilos con actividad en el rango de fechas (y cuenta) pedido,
// deduplicados, con el texto de los adjuntos ya extraído. Se capa el tamaño total para
// no reventar la ventana de contexto de modelos locales (Ollama suele tener mucho menos
// contexto disponible que los proveedores en la nube).
export async function buildPendingDigest(options: PendingDigestOptions): Promise<PendingDigestResult> {
  const db = getDb()
  const params: unknown[] = [options.fromDate, options.toDate]
  const accountFilter = options.accountIds.length > 0 ? ` AND account_id IN (${options.accountIds.map(() => '?').join(',')})` : ''
  params.push(...options.accountIds)

  const rows = db
    .prepare(`SELECT * FROM messages WHERE date >= ? AND date <= ?${accountFilter} ORDER BY date ASC`)
    .all(...params) as MessageRow[]

  if (rows.length === 0) {
    return { text: '', threadCount: 0, messageCount: 0, truncated: false, threads: [] }
  }

  const accountRows = db.prepare('SELECT id, email, display_name FROM accounts').all() as {
    id: string
    email: string
    display_name: string
  }[]
  const accountLabel = new Map(accountRows.map((a) => [a.id, `${a.display_name} <${a.email}>`]))

  const byThread = new Map<string, MessageRow[]>()
  for (const row of rows) {
    const key = `${row.account_id}::${row.thread_key}`
    const bucket = byThread.get(key)
    if (bucket) bucket.push(row)
    else byThread.set(key, [row])
  }

  // Priorizamos los hilos con actividad más reciente: si hay que truncar por tamaño,
  // que se caigan los hilos más viejos del rango, no los más frescos.
  const threadGroups = Array.from(byThread.values())
    .map((rawRows) => dedupeByMessageId(rawRows))
    .sort((a, b) => new Date(b[b.length - 1].date).getTime() - new Date(a[a.length - 1].date).getTime())

  let attachmentsProcessed = 0
  let totalChars = 0
  let messageCount = 0
  let truncated = false
  const chunks: string[] = []
  const threadRefs: PendingDigestThreadRef[] = []

  for (const messageRows of threadGroups) {
    const accountId = messageRows[0].account_id
    const threadKey = messageRows[0].thread_key
    const subject = messageRows[messageRows.length - 1].subject
    const label = accountLabel.get(accountId) ?? accountId
    const messageIds = messageRows.map((r) => r.id)

    const attachmentRows = db
      .prepare(`SELECT id, message_id, filename, content_type, content FROM attachments WHERE message_id IN (${messageIds.map(() => '?').join(',')})`)
      .all(...messageIds) as AttachmentRow[]
    const attachmentsByMessage = new Map<string, AttachmentRow[]>()
    for (const attachment of attachmentRows) {
      const bucket = attachmentsByMessage.get(attachment.message_id)
      if (bucket) bucket.push(attachment)
      else attachmentsByMessage.set(attachment.message_id, [attachment])
    }

    const threadLines: string[] = [`--- Hilo: "${subject}" (cuenta: ${label}) ---`]

    for (const row of messageRows) {
      const to = formatParticipants(row.to_json)
      const body = row.body_text.trim().slice(0, MAX_MESSAGE_CHARS)
      threadLines.push(`[${row.date}] De: ${formatFrom(row.from_name, row.from_email)}${to ? ` | Para: ${to}` : ''}\n${body}`)

      for (const attachment of attachmentsByMessage.get(row.id) ?? []) {
        if (attachmentsProcessed >= MAX_ATTACHMENTS) {
          threadLines.push(`Adjunto: ${attachment.filename} (no procesado, se alcanzó el límite de adjuntos del digest)`)
          continue
        }
        attachmentsProcessed++
        const text = await extractAttachmentText(attachment.filename, attachment.content_type, attachment.content)
        threadLines.push(
          text
            ? `Adjunto "${attachment.filename}" (texto extraído): ${text}`
            : `Adjunto "${attachment.filename}" (no se pudo extraer texto)`
        )
      }
    }

    const threadText = threadLines.join('\n')
    if (totalChars + threadText.length > MAX_TOTAL_CHARS) {
      truncated = true
      break
    }
    totalChars += threadText.length
    messageCount += messageRows.length
    chunks.push(threadText)
    threadRefs.push({ accountId, threadKey, subject })
  }

  return { text: chunks.join('\n\n'), threadCount: chunks.length, messageCount, truncated, threads: threadRefs }
}
