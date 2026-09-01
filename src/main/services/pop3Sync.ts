import Pop3Command from 'node-pop3'
import { getDb } from '../db'
import { parseRawMessage, type ParsedMessage } from './mailParser'
import { insertMessage, listRemoteUidsForFolder, upsertFolder } from './mailRepository'
import { getIncomingPassword } from './accountsRepository'
import type { Account } from '@shared/types'

export async function syncPop3Account(account: Account): Promise<number> {
  const folderId = upsertFolder(account.id, 'INBOX', 'Bandeja de entrada', 'inbox')
  const existingUids = listRemoteUidsForFolder(folderId)

  const pop3 = new Pop3Command({
    host: account.incoming.host,
    port: account.incoming.port,
    tls: account.incoming.secure,
    user: account.incoming.username,
    password: getIncomingPassword(account.id)
  })

  // Igual que en IMAP: se trae y parsea todo primero, y los INSERT van todos juntos en una
  // sola transacción al final, en vez de un commit de SQLite por mensaje nuevo.
  const fetched: { uid: string; parsed: ParsedMessage }[] = []
  try {
    const entries = (await pop3.UIDL()) as string[][]
    for (const [msgNum, uid] of entries) {
      if (existingUids.has(uid)) continue
      const raw = await pop3.RETR(Number(msgNum))
      const parsed = await parseRawMessage(raw)
      fetched.push({ uid, parsed })
    }
  } finally {
    await pop3.QUIT()
  }

  let newCount = 0
  const insertAll = getDb().transaction(() => {
    for (const item of fetched) {
      const inserted = insertMessage(account.id, folderId, item.uid, item.parsed, false, false)
      if (inserted) newCount++
    }
  })
  insertAll()

  return newCount
}
