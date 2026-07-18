import { randomUUID } from 'crypto'
import { getDb } from '../db'
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
  const rows = getDb().prepare('SELECT * FROM folders WHERE account_id = ?').all(accountId) as FolderRow[]

  return rows
    .map((row) => {
      const unread = getDb()
        .prepare('SELECT COUNT(*) as count FROM messages WHERE folder_id = ? AND is_read = 0')
        .get(row.id) as { count: number }

      return {
        id: row.id,
        accountId: row.account_id,
        name: row.display_name,
        kind: row.kind,
        unreadCount: unread.count
      }
    })
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
): void {
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

function rowToMessage(row: MessageRow, attachments: AttachmentMeta[]): Message {
  return {
    id: row.id,
    from: { name: row.from_name || row.from_email || 'Desconocido', email: row.from_email || '' },
    to: row.to_json ? JSON.parse(row.to_json) : [],
    cc: row.cc_json ? JSON.parse(row.cc_json) : [],
    date: row.date,
    bodyText: row.body_text,
    bodyHtml: row.body_html ?? undefined,
    isRead: Boolean(row.is_read),
    messageId: row.message_id,
    references: row.refs_json ? JSON.parse(row.refs_json) : [],
    attachments
  }
}

export function listThreadsForFolder(accountId: string, folderId: string): Thread[] {
  const db = getDb()

  const threadKeyRows = db
    .prepare('SELECT DISTINCT thread_key FROM messages WHERE account_id = ? AND folder_id = ?')
    .all(accountId, folderId) as { thread_key: string }[]

  if (threadKeyRows.length === 0) return []

  const threadKeys = threadKeyRows.map((row) => row.thread_key)
  const placeholders = threadKeys.map(() => '?').join(',')

  const rows = db
    .prepare(`SELECT * FROM messages WHERE account_id = ? AND thread_key IN (${placeholders}) ORDER BY date ASC`)
    .all(accountId, ...threadKeys) as MessageRow[]

  const attachmentsByMessage = getAttachmentsByMessageIds(rows.map((row) => row.id))

  const byThread = new Map<string, MessageRow[]>()
  for (const row of rows) {
    const bucket = byThread.get(row.thread_key)
    if (bucket) bucket.push(row)
    else byThread.set(row.thread_key, [row])
  }

  const threads: Thread[] = []
  for (const [threadKey, messageRows] of byThread) {
    const lastRow = messageRows[messageRows.length - 1]
    const participantsMap = new Map<string, { name: string; email: string }>()
    for (const row of messageRows) {
      if (row.from_email) participantsMap.set(row.from_email, { name: row.from_name || row.from_email, email: row.from_email })
    }

    threads.push({
      id: threadKey,
      accountId,
      folderId,
      subject: lastRow.subject,
      participants: Array.from(participantsMap.values()),
      messages: messageRows.map((row) => rowToMessage(row, attachmentsByMessage.get(row.id) ?? [])),
      snippet: lastRow.snippet,
      lastMessageDate: lastRow.date,
      hasUnread: messageRows.some((row) => !row.is_read),
      isFlagged: messageRows.some((row) => Boolean(row.is_flagged))
    })
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
