import { ImapFlow } from 'imapflow'
import { getDb } from '../db'
import { parseRawMessage, type ParsedMessage } from './mailParser'
import { mapFolderKind, SYNCED_FOLDER_KINDS } from './folderMapping'
import { getFolderLastSyncedUid, insertMessage, markFolderSynced, upsertFolder } from './mailRepository'
import type { ResolvedAuth } from './authResolver'
import type { Account } from '@shared/types'

const INITIAL_SYNC_LIMIT = 50
const INSERT_BATCH_SIZE = 20

// La autenticación llega ya resuelta (contraseña descifrada o access token OAuth): resolverla
// requiere `electron` (safeStorage), que no existe en el proceso de sincronización.
function createImapClient(account: Account, auth: ResolvedAuth): ImapFlow {
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

  // Los INSERT van en transacciones por lotes: una por mensaje paga un commit cada vez, y una
  // sola enorme retiene el lock de escritura durante todo el sync (y el proceso principal, que
  // también escribe — marcar leído, etc. — se quedaría esperando). Un lote chico acota ambos.
  let newCount = 0
  let batch: FetchedMessage[] = []
  const flush = getDb().transaction((items: FetchedMessage[]) => {
    for (const item of items) {
      if (insertMessage(accountId, folderId, item.remoteUid, item.parsed, item.isRead, item.isFlagged)) newCount++
    }
  })

  for await (const message of client.fetch(range, { uid: true, source: true, flags: true }, { uid: useUid })) {
    if (!message.source) continue
    const parsed = await parseRawMessage(message.source)
    batch.push({
      remoteUid: String(message.uid),
      parsed,
      isRead: message.flags?.has('\\Seen') ?? false,
      isFlagged: message.flags?.has('\\Flagged') ?? false
    })
    if (message.uid > maxUid) maxUid = message.uid
    if (batch.length >= INSERT_BATCH_SIZE) {
      flush(batch)
      batch = []
    }
  }
  if (batch.length > 0) flush(batch)

  markFolderSynced(folderId, String(maxUid))
  await client.mailboxClose()
  return newCount
}

export async function syncImapAccount(account: Account, auth: ResolvedAuth): Promise<number> {
  const client = createImapClient(account, auth)

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

export async function markSeenOnImapServer(
  account: Account,
  auth: ResolvedAuth,
  remotePath: string,
  remoteUids: string[]
): Promise<void> {
  if (remoteUids.length === 0) return

  const client = createImapClient(account, auth)

  await client.connect()
  try {
    await client.mailboxOpen(remotePath)
    await client.messageFlagsAdd(remoteUids.map(Number), ['\\Seen'], { uid: true })
  } finally {
    await client.logout()
  }
}

export async function appendToImapFolder(
  account: Account,
  auth: ResolvedAuth,
  remotePath: string,
  rawMessage: Buffer
): Promise<void> {
  const client = createImapClient(account, auth)

  await client.connect()
  try {
    await client.append(remotePath, rawMessage, ['\\Seen'])
  } finally {
    await client.logout()
  }
}
