import Pop3Command from 'node-pop3'
import { getDb } from '../db'
import { parseRawMessage, type ParsedMessage } from './mailParser'
import { insertMessage, listRemoteUidsForFolder, upsertFolder } from './mailRepository'
import type { Account } from '@shared/types'

const INSERT_BATCH_SIZE = 20

export async function syncPop3Account(account: Account, password: string): Promise<number> {
  const folderId = upsertFolder(account.id, 'INBOX', 'Bandeja de entrada', 'inbox')
  const existingUids = listRemoteUidsForFolder(folderId)

  const pop3 = new Pop3Command({
    host: account.incoming.host,
    port: account.incoming.port,
    tls: account.incoming.secure,
    user: account.incoming.username,
    password
  })

  // Igual que en IMAP: los INSERT van en transacciones por lotes, no un commit por mensaje.
  let newCount = 0
  let batch: { uid: string; parsed: ParsedMessage }[] = []
  const flush = getDb().transaction((items: { uid: string; parsed: ParsedMessage }[]) => {
    for (const item of items) {
      if (insertMessage(account.id, folderId, item.uid, item.parsed, false, false)) newCount++
    }
  })

  try {
    const entries = (await pop3.UIDL()) as string[][]
    for (const [msgNum, uid] of entries) {
      if (existingUids.has(uid)) continue
      const raw = await pop3.RETR(Number(msgNum))
      batch.push({ uid, parsed: await parseRawMessage(raw) })
      if (batch.length >= INSERT_BATCH_SIZE) {
        flush(batch)
        batch = []
      }
    }
  } finally {
    await pop3.QUIT()
  }
  if (batch.length > 0) flush(batch)

  return newCount
}
