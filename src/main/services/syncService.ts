import { getAccountById, getIncomingPassword } from './accountsRepository'
import { resolveImapAuth } from './authResolver'
import { markSeenOnImapServer } from './imapSync'
import { getFolderRemotePath, markFolderReadLocal, markThreadReadLocal } from './mailRepository'
import { runInSyncProcess } from './syncClient'

// El trabajo pesado (traer, parsear, escribir en SQLite, re-threadear) corre en un proceso
// aparte — ver syncProcess.ts. Acá sólo se resuelven las credenciales, que requieren `electron`.
export async function syncAccount(accountId: string): Promise<number> {
  const account = getAccountById(accountId)

  if (account.protocol === 'imap') {
    return runInSyncProcess({ task: 'sync', account, imapAuth: await resolveImapAuth(account) })
  }
  return runInSyncProcess({ task: 'sync', account, pop3Password: getIncomingPassword(accountId) })
}

export function backfillContactsInBackground(): Promise<number> {
  return runInSyncProcess({ task: 'backfillContacts' })
}

export async function markThreadRead(accountId: string, _folderId: string, threadKey: string): Promise<void> {
  const groups = markThreadReadLocal(accountId, threadKey)
  if (groups.length === 0) return

  const account = getAccountById(accountId)
  if (account.protocol !== 'imap') return

  for (const { remotePath, uids } of groups) {
    try {
      await markSeenOnImapServer(account, await resolveImapAuth(account), remotePath, uids)
    } catch (error) {
      console.error(`No se pudo marcar como leído en el servidor IMAP (${remotePath}):`, error)
    }
  }
}

export async function markFolderRead(accountId: string, folderId: string): Promise<void> {
  const remoteUids = markFolderReadLocal(folderId)
  if (remoteUids.length === 0) return

  const account = getAccountById(accountId)
  if (account.protocol !== 'imap') return

  try {
    const remotePath = getFolderRemotePath(folderId)
    await markSeenOnImapServer(account, await resolveImapAuth(account), remotePath, remoteUids)
  } catch (error) {
    console.error('No se pudo marcar la carpeta como leída en el servidor IMAP:', error)
  }
}
