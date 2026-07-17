import Pop3Command from 'node-pop3'
import { parseRawMessage } from './mailParser'
import { insertMessage, listRemoteUidsForFolder, upsertFolder } from './mailRepository'
import { getIncomingPassword } from './accountsRepository'
import type { Account } from '@shared/types'

export async function syncPop3Account(account: Account): Promise<void> {
  const folderId = upsertFolder(account.id, 'INBOX', 'Bandeja de entrada', 'inbox')
  const existingUids = listRemoteUidsForFolder(folderId)

  const pop3 = new Pop3Command({
    host: account.incoming.host,
    port: account.incoming.port,
    tls: account.incoming.secure,
    user: account.incoming.username,
    password: getIncomingPassword(account.id)
  })

  try {
    const entries = (await pop3.UIDL()) as string[][]
    for (const [msgNum, uid] of entries) {
      if (existingUids.has(uid)) continue
      const raw = await pop3.RETR(Number(msgNum))
      const parsed = await parseRawMessage(raw)
      insertMessage(account.id, folderId, uid, parsed, false, false)
    }
  } finally {
    await pop3.QUIT()
  }
}
