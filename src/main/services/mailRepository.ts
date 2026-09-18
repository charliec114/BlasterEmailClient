import { randomUUID } from 'crypto'
import { getDb, isFtsAvailable } from '../db'
import { computeThreadKey, normalizeSubject } from './threading'
import { upsertContact } from './contactsRepository'
import type { ParsedMessage } from './mailParser'
import type { AttachmentMeta, MailFolder, Message, Thread } from '@shared/types'

const FOLDER_KIND_ORDER: Record<MailFolder['kind'], number> = {
  inbox: 0,
  sent: 1,
  drafts: 2,
  archive: 3,
  trash: 4,
  custom: 5
}

interface FolderRow {
  id: string
  account_id: string
  remote_path: string
  display_name: string
  kind: MailFolder['kind']
  last_synced_uid: string | null
  last_synced_at: string | null
}

// Columnas livianas: alcanzan para armar la lista de hilos (asunto, remitente, snippet,
// flags) sin traer el body completo de cada mensaje. El body/adjuntos completos sólo se
// piden para el hilo que el usuario tiene abierto (ver getThreadDetail más abajo) — pedirlos
// para todos los mensajes de todos los hilos de una carpeta, en cada sync automático y cada
// cambio de carpeta, es lo que inflaba el tamaño de cada consulta y lo retenido en memoria.
const LIST_COLUMNS = `
  id, account_id, folder_id, remote_uid, message_id, thread_key, subject,
  from_name, from_email, date, snippet, is_read, is_flagged
`

interface MessageRow {
  id: string
  account_id: string
  folder_id: string
  remote_uid: string
  message_id: string
  refs_json: string | null
  thread_key: string
  subject: string
  from_name: string | null
  from_email: string | null
  to_json: string | null
  cc_json: string | null
  date: string
  snippet: string
  body_text: string
  body_html: string | null
  is_read: number
  is_flagged: number
}

type MessageListRow = Omit<MessageRow, 'refs_json' | 'to_json' | 'cc_json' | 'body_text' | 'body_html'>

export function upsertFolder(
  accountId: string,
  remotePath: string,
  displayName: string,
  kind: MailFolder['kind']
): string {
  const db = getDb()
  const existing = db
    .prepare('SELECT id FROM folders WHERE account_id = ? AND remote_path = ?')
    .get(accountId, remotePath) as { id: string } | undefined

  if (existing) {
    db.prepare('UPDATE folders SET display_name = ?, kind = ? WHERE id = ?').run(displayName, kind, existing.id)
    return existing.id
  }

  const id = randomUUID()
  db.prepare(
    'INSERT INTO folders (id, account_id, remote_path, display_name, kind) VALUES (?, ?, ?, ?, ?)'
  ).run(id, accountId, remotePath, displayName, kind)
  return id
}

export function getFolderLastSyncedUid(folderId: string): string | null {
  const row = getDb().prepare('SELECT last_synced_uid FROM folders WHERE id = ?').get(folderId) as
    | { last_synced_uid: string | null }
    | undefined
  return row?.last_synced_uid ?? null
}

export function markFolderSynced(folderId: string, lastUid: string | null): void {
  getDb()
    .prepare('UPDATE folders SET last_synced_uid = ?, last_synced_at = ? WHERE id = ?')
    .run(lastUid, new Date().toISOString(), folderId)
}

export function listFoldersForAccount(accountId: string): MailFolder[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM folders WHERE account_id = ?').all(accountId) as FolderRow[]

  const unreadByFolder = new Map<string, number>()
  for (const row of db
    .prepare(
      `SELECT folder_id, COUNT(*) as count FROM messages
       WHERE account_id = ? AND is_read = 0 GROUP BY folder_id`
    )
    .all(accountId) as { folder_id: string; count: number }[]) {
    unreadByFolder.set(row.folder_id, row.count)
  }

  return rows
    .map((row) => ({
      id: row.id,
      accountId: row.account_id,
      name: row.display_name,
      kind: row.kind,
      unreadCount: unreadByFolder.get(row.id) ?? 0
    }))
    .sort((a, b) => FOLDER_KIND_ORDER[a.kind] - FOLDER_KIND_ORDER[b.kind])
}

export function getSentFolderRemotePath(accountId: string): string | null {
  const row = getDb()
    .prepare(`SELECT remote_path FROM folders WHERE account_id = ? AND kind = 'sent' LIMIT 1`)
    .get(accountId) as { remote_path: string } | undefined
  return row?.remote_path ?? null
}

export function getFolderRemotePath(folderId: string): string {
  const row = getDb().prepare('SELECT remote_path FROM folders WHERE id = ?').get(folderId) as
    | { remote_path: string }
    | undefined
  if (!row) throw new Error(`Carpeta no encontrada: ${folderId}`)
  return row.remote_path
}

export function markThreadReadLocal(folderId: string, threadKey: string): string[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT remote_uid FROM messages WHERE folder_id = ? AND thread_key = ? AND is_read = 0')
    .all(folderId, threadKey) as { remote_uid: string }[]

  db.prepare('UPDATE messages SET is_read = 1 WHERE folder_id = ? AND thread_key = ?').run(folderId, threadKey)

  return rows.map((row) => row.remote_uid)
}

export function markFolderReadLocal(folderId: string): string[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT remote_uid FROM messages WHERE folder_id = ? AND is_read = 0')
    .all(folderId) as { remote_uid: string }[]

  db.prepare('UPDATE messages SET is_read = 1 WHERE folder_id = ?').run(folderId)

  return rows.map((row) => row.remote_uid)
}

export function listRemoteUidsForFolder(folderId: string): Set<string> {
  const rows = getDb().prepare('SELECT remote_uid FROM messages WHERE folder_id = ?').all(folderId) as {
    remote_uid: string
  }[]
  return new Set(rows.map((row) => row.remote_uid))
}

export function insertMessage(
  accountId: string,
  folderId: string,
  remoteUid: string,
  parsed: ParsedMessage,
  isRead: boolean,
  isFlagged: boolean
): boolean {
  const db = getDb()
  const subjectNorm = normalizeSubject(parsed.subject)
  const threadKey = computeThreadKey(db, accountId, parsed, subjectNorm, parsed.date)
  const messageId = randomUUID()

  const insert = db.prepare(
    `INSERT OR IGNORE INTO messages (
      id, account_id, folder_id, remote_uid, message_id, in_reply_to, refs_json,
      thread_key, subject, subject_norm, from_name, from_email, to_json, cc_json, date,
      snippet, body_text, body_html, is_read, is_flagged, created_at
    ) VALUES (
      @id, @accountId, @folderId, @remoteUid, @messageId, @inReplyTo, @refsJson,
      @threadKey, @subject, @subjectNorm, @fromName, @fromEmail, @toJson, @ccJson, @date,
      @snippet, @bodyText, @bodyHtml, @isRead, @isFlagged, @createdAt
    )`
  )
  const insertResult = insert.run({
    id: messageId,
    accountId,
    folderId,
    remoteUid,
    messageId: parsed.messageId,
    inReplyTo: parsed.inReplyTo,
    refsJson: JSON.stringify(parsed.references),
    threadKey,
    subject: parsed.subject,
    subjectNorm,
    fromName: parsed.fromName,
    fromEmail: parsed.fromEmail,
    toJson: JSON.stringify(parsed.to),
    ccJson: JSON.stringify(parsed.cc),
    date: parsed.date,
    snippet: parsed.snippet,
    bodyText: parsed.bodyText,
    bodyHtml: parsed.bodyHtml,
    isRead: isRead ? 1 : 0,
    isFlagged: isFlagged ? 1 : 0,
    createdAt: new Date().toISOString()
  })

  if (insertResult.changes > 0 && parsed.attachments.length > 0) {
    const insertAttachment = db.prepare(
      'INSERT INTO attachments (id, message_id, filename, content_type, size, content) VALUES (?, ?, ?, ?, ?, ?)'
    )
    for (const attachment of parsed.attachments) {
      insertAttachment.run(randomUUID(), messageId, attachment.filename, attachment.contentType, attachment.size, attachment.content)
    }
  }

  if (parsed.fromEmail) {
    upsertContact(parsed.fromEmail, parsed.fromName, parsed.date)
  }

  return insertResult.changes > 0
}

export function getAttachmentContent(
  attachmentId: string
): { filename: string; contentType: string | null; content: Buffer } | null {
  const row = getDb()
    .prepare('SELECT filename, content_type, content FROM attachments WHERE id = ?')
    .get(attachmentId) as { filename: string; content_type: string | null; content: Buffer } | undefined
  if (!row) return null
  return { filename: row.filename, contentType: row.content_type, content: row.content }
}

function getAttachmentsByMessageIds(messageIds: string[]): Map<string, AttachmentMeta[]> {
  const map = new Map<string, AttachmentMeta[]>()
  if (messageIds.length === 0) return map

  const placeholders = messageIds.map(() => '?').join(',')
  const rows = getDb()
    .prepare(`SELECT id, message_id, filename, content_type, size FROM attachments WHERE message_id IN (${placeholders})`)
    .all(...messageIds) as { id: string; message_id: string; filename: string; content_type: string | null; size: number }[]

  for (const row of rows) {
    const meta: AttachmentMeta = { id: row.id, filename: row.filename, contentType: row.content_type, size: row.size }
    const bucket = map.get(row.message_id)
    if (bucket) bucket.push(meta)
    else map.set(row.message_id, [meta])
  }

  return map
}

function rowToMessage(row: MessageRow | MessageListRow, attachments: AttachmentMeta[]): Message {
  const full = row as MessageRow
  return {
    id: row.id,
    from: { name: row.from_name || row.from_email || 'Desconocido', email: row.from_email || '' },
    to: full.to_json ? JSON.parse(full.to_json) : [],
    cc: full.cc_json ? JSON.parse(full.cc_json) : [],
    subject: row.subject,
    date: row.date,
    bodyText: full.body_text ?? '',
    bodyHtml: full.body_html ?? undefined,
    isRead: Boolean(row.is_read),
    messageId: row.message_id,
    references: full.refs_json ? JSON.parse(full.refs_json) : [],
    attachments
  }
}

// Gmail expone el mismo mensaje en varias carpetas (labels) — típicamente en INBOX y en
// "Todos" ([Gmail]/All Mail, que sincronizamos como 'archive') — así que un mismo email
// puede quedar guardado dos veces con distinto folder_id/remote_uid. Se deduplica por
// message_id, combinando los flags (leído/marcado si lo está en cualquiera de las copias).
function dedupeByMessageId<T extends { message_id: string; is_read: number; is_flagged: number }>(rows: T[]): T[] {
  const byMessageId = new Map<string, T>()
  for (const row of rows) {
    const existing = byMessageId.get(row.message_id)
    if (!existing) {
      byMessageId.set(row.message_id, row)
    } else {
      existing.is_read = existing.is_read || row.is_read
      existing.is_flagged = existing.is_flagged || row.is_flagged
    }
  }
  return Array.from(byMessageId.values())
}

// Arma los hilos de una cuenta a partir de una lista de thread_keys. El folderId que
// queda en cada Thread es el de la carpeta "más primaria" entre las que tiene mensajes
// (inbox > sent > ... > custom, ver FOLDER_KIND_ORDER) — importante para búsquedas que
// cruzan carpetas, donde no hay una carpeta "actual" obvia como en listThreadsForFolder.
//
// `detail` controla cuánto se trae de cada mensaje: en modo lista (false, el default) se
// omiten body_text/body_html/refs_json/to_json/cc_json y los adjuntos — sólo se usan para
// renderizar el hilo abierto en el Reading Pane (ver getThreadDetail). Pedirlos para todos
// los mensajes de todos los hilos de una carpeta, en cada sync automático y cada cambio de
// carpeta, es lo que inflaba cada consulta y lo retenido en el store del renderer.
function buildThreadsForKeys(accountId: string, threadKeys: string[], detail = false): Thread[] {
  const db = getDb()
  if (threadKeys.length === 0) return []

  const placeholders = threadKeys.map(() => '?').join(',')
  const rows = (
    detail
      ? (db
          .prepare(`SELECT * FROM messages WHERE account_id = ? AND thread_key IN (${placeholders}) ORDER BY date ASC`)
          .all(accountId, ...threadKeys) as MessageRow[])
      : (db
          .prepare(
            `SELECT ${LIST_COLUMNS} FROM messages WHERE account_id = ? AND thread_key IN (${placeholders}) ORDER BY date ASC`
          )
          .all(accountId, ...threadKeys) as MessageListRow[])
  )

  const folderKindById = new Map<string, MailFolder['kind']>()
  for (const folder of db.prepare('SELECT id, kind FROM folders WHERE account_id = ?').all(accountId) as {
    id: string
    kind: MailFolder['kind']
  }[]) {
    folderKindById.set(folder.id, folder.kind)
  }

  const attachmentsByMessage = detail ? getAttachmentsByMessageIds(rows.map((row) => row.id)) : new Map<string, AttachmentMeta[]>()

  const byThread = new Map<string, (MessageRow | MessageListRow)[]>()
  for (const row of rows) {
    const bucket = byThread.get(row.thread_key)
    if (bucket) bucket.push(row)
    else byThread.set(row.thread_key, [row])
  }

  const threads: Thread[] = []
  for (const [threadKey, rawMessageRows] of byThread) {
    const messageRows = dedupeByMessageId(rawMessageRows)
    const lastRow = messageRows[messageRows.length - 1]
    const primaryRow = [...messageRows].sort(
      (a, b) =>
        FOLDER_KIND_ORDER[folderKindById.get(a.folder_id) ?? 'custom'] -
        FOLDER_KIND_ORDER[folderKindById.get(b.folder_id) ?? 'custom']
    )[0]

    const participantsMap = new Map<string, { name: string; email: string }>()
    for (const row of messageRows) {
      if (row.from_email) participantsMap.set(row.from_email, { name: row.from_name || row.from_email, email: row.from_email })
    }

    threads.push({
      id: threadKey,
      accountId,
      folderId: primaryRow.folder_id,
      subject: lastRow.subject,
      participants: Array.from(participantsMap.values()),
      messages: messageRows.map((row) => rowToMessage(row, attachmentsByMessage.get(row.id) ?? [])),
      snippet: lastRow.snippet,
      lastMessageDate: lastRow.date,
      hasUnread: messageRows.some((row) => !row.is_read),
      isFlagged: messageRows.some((row) => Boolean(row.is_flagged))
    })
  }

  return threads
}

export function listThreadsForFolder(accountId: string, folderId: string): Thread[] {
  const threadKeyRows = getDb()
    .prepare('SELECT DISTINCT thread_key FROM messages WHERE account_id = ? AND folder_id = ?')
    .all(accountId, folderId) as { thread_key: string }[]

  if (threadKeyRows.length === 0) return []

  const threads = buildThreadsForKeys(accountId, threadKeyRows.map((row) => row.thread_key))
  // El usuario está navegando esta carpeta puntual: las acciones (marcar leído, etc.)
  // tienen que referirse a ella, no a la carpeta "primaria" que elige buildThreadsForKeys.
  return threads
    .map((thread) => ({ ...thread, folderId }))
    .sort((a, b) => new Date(b.lastMessageDate).getTime() - new Date(a.lastMessageDate).getTime())
}

// Trae un único hilo con el body/adjuntos completos de todos sus mensajes — se pide al abrir
// un hilo en el Reading Pane (ver useMailDataStore.fetchThreadDetail), separado de las
// consultas de lista que usan buildThreadsForKeys en modo liviano.
export function getThreadDetail(accountId: string, threadKey: string): Thread | undefined {
  return buildThreadsForKeys(accountId, [threadKey], true)[0]
}

// Cada término se busca como prefijo (equivalente al LIKE '%term%' de antes, pero por
// palabra en vez de substring literal) — necesario porque la búsqueda dispara con cada
// tecleo. Las comillas evitan que caracteres de sintaxis de FTS5 (@, ., -, etc., comunes
// en direcciones de mail) rompan el parseo de la consulta.
function buildFtsQuery(trimmed: string): string {
  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(' ')
}

function searchMessageMatches(trimmed: string): { account_id: string; thread_key: string }[] {
  const db = getDb()

  if (isFtsAvailable()) {
    try {
      return db
        .prepare(
          `SELECT DISTINCT m.account_id, m.thread_key
           FROM messages_fts JOIN messages m ON m.rowid = messages_fts.rowid
           WHERE messages_fts MATCH ?`
        )
        .all(buildFtsQuery(trimmed)) as { account_id: string; thread_key: string }[]
    } catch (error) {
      console.error('Búsqueda FTS5 falló, usando LIKE:', error)
    }
  }

  const like = `%${trimmed}%`
  return db
    .prepare(
      `SELECT DISTINCT account_id, thread_key FROM messages
       WHERE subject LIKE ? OR body_text LIKE ? OR from_name LIKE ? OR from_email LIKE ?
          OR to_json LIKE ? OR cc_json LIKE ?`
    )
    .all(like, like, like, like, like, like) as { account_id: string; thread_key: string }[]
}

export function searchMessages(query: string): Thread[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const matches = searchMessageMatches(trimmed)
  if (matches.length === 0) return []

  const keysByAccount = new Map<string, string[]>()
  for (const match of matches) {
    const list = keysByAccount.get(match.account_id) ?? []
    list.push(match.thread_key)
    keysByAccount.set(match.account_id, list)
  }

  const threads: Thread[] = []
  for (const [accountId, threadKeys] of keysByAccount) {
    threads.push(...buildThreadsForKeys(accountId, threadKeys))
  }

  return threads.sort((a, b) => new Date(b.lastMessageDate).getTime() - new Date(a.lastMessageDate).getTime())
}

export function listUnifiedInboxThreads(): Thread[] {
  const inboxFolders = getDb()
    .prepare(`SELECT id, account_id FROM folders WHERE kind = 'inbox'`)
    .all() as { id: string; account_id: string }[]

  const threads = inboxFolders.flatMap((folder) => listThreadsForFolder(folder.account_id, folder.id))

  return threads.sort((a, b) => new Date(b.lastMessageDate).getTime() - new Date(a.lastMessageDate).getTime())
}
