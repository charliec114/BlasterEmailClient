import { getDb } from '../db'
import { getAccountById } from './accountsRepository'
import { markSeenOnImapServer, syncImapAccount } from './imapSync'
import { syncPop3Account } from './pop3Sync'
import { getFolderRemotePath, markThreadReadLocal } from './mailRepository'
import { rethreadAccount } from './threading'
import { backfillContactsFromMessages } from './contactsRepository'

export async function syncAccount(accountId: string): Promise<void> {
  const account = getAccountById(accountId)

  if (account.protocol === 'imap') {
    await syncImapAccount(account)
  } else {
    await syncPop3Account(account)
  }

  rethreadAccount(getDb(), accountId)
  backfillContactsFromMessages()
}

export async function markThreadRead(accountId: string, folderId: string, threadKey: string): Promise<void> {
  const remoteUids = markThreadReadLocal(folderId, threadKey)
  if (remoteUids.length === 0) return

  const account = getAccountById(accountId)
  if (account.protocol !== 'imap') return

  try {
    const remotePath = getFolderRemotePath(folderId)
    await markSeenOnImapServer(account, remotePath, remoteUids)
  } catch (error) {
    console.error('No se pudo marcar como leído en el servidor IMAP:', error)
  }
}
