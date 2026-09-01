import { ImapFlow } from 'imapflow'
import { getDb } from '../db'
import { parseRawMessage, type ParsedMessage } from './mailParser'
import { mapFolderKind, SYNCED_FOLDER_KINDS } from './folderMapping'
import { getFolderLastSyncedUid, insertMessage, markFolderSynced, upsertFolder } from './mailRepository'
import { resolveImapAuth } from './authResolver'
import type { Account } from '@shared/types'

const INITIAL_SYNC_LIMIT = 50

async function createImapClient(account: Account): Promise<ImapFlow> {
  const auth = await resolveImapAuth(account)
  return new ImapFlow({
    host: account.incoming.host,
    port: account.incoming.port,
    secure: account.incoming.secure,
    auth,
    logger: false
  })
}

interface FetchedMessage {
  remoteUid: string
  parsed: ParsedMessage
  isRead: boolean
  isFlagged: boolean
}

async function syncFolder(client: ImapFlow, accountId: string, folderId: string, path: string): Promise<number> {
  const mailbox = await client.mailboxOpen(path, { readOnly: true })
  if (mailbox.exists === 0) {
    await client.mailboxClose()
    return 0
  }

  const lastSyncedUid = getFolderLastSyncedUid(folderId)
  const useUid = Boolean(lastSyncedUid)
  const range = useUid ? `${Number(lastSyncedUid) + 1}:*` : `${Math.max(1, mailbox.exists - INITIAL_SYNC_LIMIT + 1)}:*`

  let maxUid = lastSyncedUid ? Number(lastSyncedUid) : 0

  // Primero se trae y parsea todo (I/O + CPU async, un mensaje a la vez) y recién al final
  // se escribe a SQLite — así todos los INSERT de esta carpeta entran en una sola transacción
  // en vez de un commit por mensaje, que es lo que hacía que sincronizar una carpeta con
  // muchos mensajes nuevos trabara el proceso principal (y con él, toda la ventana).
  const fetched: FetchedMessage[] = []
  for await (const message of client.fetch(range, { uid: true, source: true, flags: true }, { uid: useUid })) {
    if (!message.source) continue
    const parsed = await parseRawMessage(message.source)
    fetched.push({
      remoteUid: String(message.uid),
      parsed,
      isRead: message.flags?.has('\\Seen') ?? false,
      isFlagged: message.flags?.has('\\Flagged') ?? false
    })
    if (message.uid > maxUid) maxUid = message.uid
  }

  let newCount = 0
  const insertAll = getDb().transaction(() => {
    for (const item of fetched) {
      const inserted = insertMessage(accountId, folderId, item.remoteUid, item.parsed, item.isRead, item.isFlagged)
      if (inserted) newCount++
    }
  })
  insertAll()

  markFolderSynced(folderId, String(maxUid))
  await client.mailboxClose()
  return newCount
}

export async function syncImapAccount(account: Account): Promise<number> {
  const client = await createImapClient(account)

  await client.connect()

  let newCount = 0
  try {
    const mailboxes = await client.list()
    for (const mailbox of mailboxes) {
      if (mailbox.flags.has('\\Noselect')) continue

      const kind = mapFolderKind(mailbox.path, mailbox.specialUse, mailbox.name)
      if (!SYNCED_FOLDER_KINDS.has(kind)) continue

      const folderId = upsertFolder(account.id, mailbox.path, mailbox.name, kind)
      newCount += await syncFolder(client, account.id, folderId, mailbox.path)
    }
  } finally {
    await client.logout()
  }
  return newCount
}

export async function markSeenOnImapServer(account: Account, remotePath: string, remoteUids: string[]): Promise<void> {
  if (remoteUids.length === 0) return

  const client = await createImapClient(account)

  await client.connect()
  try {
    await client.mailboxOpen(remotePath)
    await client.messageFlagsAdd(remoteUids.map(Number), ['\\Seen'], { uid: true })
  } finally {
    await client.logout()
  }
}

export async function appendToImapFolder(account: Account, remotePath: string, rawMessage: Buffer): Promise<void> {
  const client = await createImapClient(account)

  await client.connect()
  try {
    await client.append(remotePath, rawMessage, ['\\Seen'])
  } finally {
    await client.logout()
  }
}
