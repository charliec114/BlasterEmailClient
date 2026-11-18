import { getAccountById, getIncomingPassword } from './accountsRepository'
import { resolveImapAuth } from './authResolver'
import { pushPendingFlags } from './imapSync'
import { isNetworkError } from './netUtil'
import { markFolderReadLocal, markThreadReadLocal } from './mailRepository'
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

// Marcar como leído es local-primero: la base cambia al instante (y funciona sin conexión), el
// cambio queda en la cola pending_flag_ops y se manda al servidor ahora si se puede, o en el
// próximo sync si no.
async function pushFlagsBestEffort(accountId: string): Promise<void> {
  try {
    const account = getAccountById(accountId)
    if (account.protocol !== 'imap') return
    await pushPendingFlags(account, await resolveImapAuth(account))
  } catch (error) {
    if (!isNetworkError(error)) console.error('No se pudieron enviar los cambios de leído al servidor IMAP:', error)
  }
}

export async function markThreadRead(accountId: string, _folderId: string, threadKey: string): Promise<void> {
  markThreadReadLocal(accountId, threadKey)
  await pushFlagsBestEffort(accountId)
}

export async function markFolderRead(accountId: string, folderId: string): Promise<void> {
  markFolderReadLocal(accountId, folderId)
  await pushFlagsBestEffort(accountId)
}
