import { ImapFlow } from 'imapflow'
import { parseRawMessage } from './mailParser'
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

async function syncFolder(client: ImapFlow, accountId: string, folderId: string, path: string): Promise<void> {
  const mailbox = await client.mailboxOpen(path, { readOnly: true })
  if (mailbox.exists === 0) {
    await client.mailboxClose()
    return
  }

  const lastSyncedUid = getFolderLastSyncedUid(folderId)
  const useUid = Boolean(lastSyncedUid)
  const range = useUid ? `${Number(lastSyncedUid) + 1}:*` : `${Math.max(1, mailbox.exists - INITIAL_SYNC_LIMIT + 1)}:*`

  let maxUid = lastSyncedUid ? Number(lastSyncedUid) : 0

  for await (const message of client.fetch(range, { uid: true, source: true, flags: true }, { uid: useUid })) {
    if (!message.source) continue
    const parsed = await parseRawMessage(message.source)
    const isRead = message.flags?.has('\\Seen') ?? false
    const isFlagged = message.flags?.has('\\Flagged') ?? false
    insertMessage(accountId, folderId, String(message.uid), parsed, isRead, isFlagged)
    if (message.uid > maxUid) maxUid = message.uid
  }

  markFolderSynced(folderId, String(maxUid))
  await client.mailboxClose()
}

export async function syncImapAccount(account: Account): Promise<void> {
  const client = await createImapClient(account)

  await client.connect()

  try {
    const mailboxes = await client.list()
    for (const mailbox of mailboxes) {
      if (mailbox.flags.has('\\Noselect')) continue

      const kind = mapFolderKind(mailbox.path, mailbox.specialUse, mailbox.name)
      if (!SYNCED_FOLDER_KINDS.has(kind)) continue

      const folderId = upsertFolder(account.id, mailbox.path, mailbox.name, kind)
      await syncFolder(client, account.id, folderId, mailbox.path)
    }
  } finally {
    await client.logout()
  }
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
