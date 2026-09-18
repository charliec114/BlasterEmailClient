import { getDb } from '../db'
import { getAccountById } from './accountsRepository'
import { markSeenOnImapServer, syncImapAccount } from './imapSync'
import { syncPop3Account } from './pop3Sync'
import { getFolderRemotePath, markFolderReadLocal, markThreadReadLocal } from './mailRepository'
import { rethreadAccount } from './threading'
import { getSetting, setSetting } from './settingsRepository'

const RETHREAD_BACKFILL_DONE_PREFIX = 'threadBackfillDone:'
const RETHREAD_RECENT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000

export async function syncAccount(accountId: string): Promise<void> {
  const account = getAccountById(accountId)

  const newMessageCount =
    account.protocol === 'imap' ? await syncImapAccount(account) : await syncPop3Account(account)

  // Re-threadear sólo vale la pena pagarlo cuando efectivamente llegó mail nuevo. La mayoría
  // de los syncs automáticos (cada 5 min, sin nada nuevo) no tocan la base para nada.
  if (newMessageCount > 0) {
    const backfillFlag = `${RETHREAD_BACKFILL_DONE_PREFIX}${accountId}`
    if (getSetting(backfillFlag)) {
      // Cuenta ya prolijada una vez: de acá en más alcanza con recalcular lo reciente
      // (ver comentario en threading.ts) — el costo ya no crece con el historial total.
      const sinceIso = new Date(Date.now() - RETHREAD_RECENT_WINDOW_MS).toISOString()
      rethreadAccount(getDb(), accountId, sinceIso)
    } else {
      rethreadAccount(getDb(), accountId)
      setSetting(backfillFlag, 'true')
    }
  }
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

export async function markFolderRead(accountId: string, folderId: string): Promise<void> {
  const remoteUids = markFolderReadLocal(folderId)
  if (remoteUids.length === 0) return

  const account = getAccountById(accountId)
  if (account.protocol !== 'imap') return

  try {
    const remotePath = getFolderRemotePath(folderId)
    await markSeenOnImapServer(account, remotePath, remoteUids)
  } catch (error) {
    console.error('No se pudo marcar la carpeta como leída en el servidor IMAP:', error)
  }
}
