import { ImapFlow } from 'imapflow'
import { getDb } from '../db'
import { parseRawMessage, type ParsedMessage } from './mailParser'
import { mapFolderKind, SYNCED_FOLDER_KINDS } from './folderMapping'
import {
  deleteMessagesByRemoteUid,
  deletePendingFlagOps,
  getFolderSyncState,
  insertMessage,
  listPendingFlagOps,
  listRemoteUidsForFolder,
  markFolderSynced,
  reconcileFlags,
  saveFolderFlagsState,
  upsertFolder
} from './mailRepository'
import { withTimeout } from './netUtil'
import type { ResolvedAuth } from './authResolver'
import type { Account, MailFolder } from '@shared/types'

const INITIAL_SYNC_LIMIT = 50
const INSERT_BATCH_SIZE = 20
// Aunque el servidor soporte CONDSTORE (sólo trae lo que cambió), cada tanto se compara todo: es la
// red de seguridad por si algún cambio se perdió.
const FULL_FLAG_RECONCILE_MS = 6 * 60 * 60 * 1000
// Tope total de una operación IMAP completa (un sync de cuenta, subir una copia a Enviados...).
// Además de los timeouts de socket: ninguna conexión debería vivir más que esto.
const SYNC_DEADLINE_MS = 8 * 60 * 1000
const QUICK_DEADLINE_MS = 60 * 1000

// La autenticación llega ya resuelta (contraseña descifrada o access token OAuth): resolverla
// requiere `electron` (safeStorage), que no existe en el proceso de sincronización.
function createImapClient(account: Account, auth: ResolvedAuth): ImapFlow {
  const client = new ImapFlow({
    host: account.incoming.host,
    port: account.incoming.port,
    secure: account.incoming.secure,
    auth,
    logger: false,
    // Sin esto, una conexión que muere en silencio (suspender la máquina, cambiar de red, el
    // servidor que corta sin avisar) deja el sync esperando para siempre.
    connectionTimeout: 30_000,
    greetingTimeout: 20_000,
    socketTimeout: 90_000
  })
  // ImapFlow emite 'error' ante un reset del socket; sin un listener, Node lo trata como excepción
  // no capturada y tumba el proceso. El error igual le llega a quien esté esperando una operación.
  client.on('error', (error: Error) => {
    console.error(`IMAP (${account.email}):`, error.message)
  })
  return client
}

// Conecta, corre `work` y siempre cierra; si pasa el plazo mata el socket para liberar todo.
async function withImapClient<T>(
  account: Account,
  auth: ResolvedAuth,
  deadlineMs: number,
  work: (client: ImapFlow) => Promise<T>
): Promise<T> {
  const client = createImapClient(account, auth)
  const kill = (): void => client.close()
  try {
    return await withTimeout(
      (async () => {
        await client.connect()
        return work(client)
      })(),
      deadlineMs,
      `IMAP ${account.email}`,
      kill
    )
  } finally {
    // logout() puede colgarse si la conexión ya está rota: se lo acota y, si falla, se cierra el socket.
    await withTimeout(client.logout(), 10_000, 'IMAP logout', kill).catch(() => client.close())
  }
}

interface FetchedMessage {
  remoteUid: string
  parsed: ParsedMessage
  isRead: boolean
  isFlagged: boolean
}

// Quita de la base local lo que el servidor ya no tiene (enviado, borrado o movido desde otro
// cliente). El sync incremental por UID solo ve mensajes nuevos, así que sin esto un borrador
// autoguardado de Gmail quedaba para siempre como un mensaje fantasma en el hilo.
async function removeVanishedMessages(client: ImapFlow, folderId: string, localUids: Set<string>): Promise<number> {
  const serverUids = await client.search({ all: true }, { uid: true })
  if (!serverUids) return 0
  const onServer = new Set(serverUids.map(String))
  const gone = [...localUids].filter((uid) => !onServer.has(uid))
  return deleteMessagesByRemoteUid(folderId, gone)
}

// Trae los flags del servidor y los vuelca a la base local (la mitad "servidor -> acá" de la
// sincronización: marcar leído en la web de Gmail tiene que verse acá). Con CONDSTORE alcanza con
// pedir lo que cambió desde el último modseq; sin él (o cada tanto) se compara todo.
async function pullFlags(client: ImapFlow, folderId: string, highestModseq: bigint | undefined, localUids: Set<string>): Promise<number> {
  if (localUids.size === 0) return 0

  const state = getFolderSyncState(folderId)
  const lastFullMs = state.lastFlagsFullAt ? Date.parse(state.lastFlagsFullAt) : 0
  const incremental =
    highestModseq !== undefined && state.lastModseq !== null && Date.now() - lastFullMs < FULL_FLAG_RECONCILE_MS

  // Sólo importan los mensajes que existen localmente: se arranca desde el UID más bajo que tenemos.
  let minUid = Infinity
  for (const uid of localUids) {
    const n = Number(uid)
    if (n < minUid) minUid = n
  }

  const serverFlags: { uid: string; isRead: boolean; isFlagged: boolean }[] = []
  const options = incremental ? { uid: true, changedSince: BigInt(state.lastModseq as string) } : { uid: true }
  for await (const message of client.fetch(`${minUid}:*`, { uid: true, flags: true }, options)) {
    serverFlags.push({
      uid: String(message.uid),
      isRead: message.flags?.has('\\Seen') ?? false,
      isFlagged: message.flags?.has('\\Flagged') ?? false
    })
  }

  const changed = reconcileFlags(folderId, serverFlags)
  saveFolderFlagsState(folderId, highestModseq !== undefined ? highestModseq.toString() : null, !incremental)
  return changed
}

interface FolderSyncResult {
  added: number
  changed: number
}

async function syncFolder(
  client: ImapFlow,
  accountId: string,
  folderId: string,
  path: string,
  kind: MailFolder['kind']
): Promise<FolderSyncResult> {
  const mailbox = await client.mailboxOpen(path, { readOnly: true })
  if (mailbox.exists === 0) {
    const removed = deleteMessagesByRemoteUid(folderId, [...listRemoteUidsForFolder(folderId)])
    await client.mailboxClose()
    return { added: 0, changed: removed }
  }
  // Se toma ANTES de traer nada: un cambio que ocurra durante el sync queda para el próximo.
  const highestModseq = mailbox.highestModseq

  const lastSyncedUid = getFolderSyncState(folderId).lastSyncedUid
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
    // El servidor puede devolver el último mensaje aunque el rango no tenga nada nuevo (`N:*`
    // siempre incluye al más alto): ya lo tenemos, no hace falta volver a parsearlo.
    if (useUid && message.uid <= Number(lastSyncedUid)) continue
    // Gmail guarda cada autoguardado de un borrador también en "Todos"; solo cuentan en Borradores.
    if (kind !== 'drafts' && message.flags?.has('\\Draft')) {
      if (message.uid > maxUid) maxUid = message.uid
      continue
    }
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

  const localUids = listRemoteUidsForFolder(folderId)
  const removed = await removeVanishedMessages(client, folderId, localUids)
  const flagsChanged = await pullFlags(client, folderId, highestModseq, listRemoteUidsForFolder(folderId))

  markFolderSynced(folderId, String(maxUid))
  await client.mailboxClose()
  return { added: newCount, changed: removed + flagsChanged }
}

// La otra mitad: los cambios hechos acá (marcar leído) que todavía no llegaron al servidor.
// Es idempotente (agregar \\Seen dos veces no hace nada), así que si el proceso principal y el de
// sync lo corren a la vez no pasa nada. Si una carpeta falla se sigue con las demás; lo que no se
// pudo aplicar queda en la cola para el próximo intento.
async function flushFlagOps(client: ImapFlow, accountId: string): Promise<void> {
  const ops = listPendingFlagOps(accountId)
  if (ops.length === 0) return

  const groups = new Map<string, typeof ops>()
  for (const op of ops) {
    const key = `${op.remotePath}\u0000${op.flag}\u0000${op.add}`
    const list = groups.get(key)
    if (list) list.push(op)
    else groups.set(key, [op])
  }

  for (const group of groups.values()) {
    const { remotePath, flag, add } = group[0]
    try {
      await client.mailboxOpen(remotePath)
      const uids = group.map((op) => Number(op.remoteUid))
      if (add) await client.messageFlagsAdd(uids, [flag], { uid: true })
      else await client.messageFlagsRemove(uids, [flag], { uid: true })
      deletePendingFlagOps(group.map((op) => op.id))
      await client.mailboxClose()
    } catch (error) {
      console.error(`No se pudieron enviar cambios de flags a ${remotePath}:`, error)
    }
  }
}

export interface ImapSyncResult {
  added: number
  changed: number
}

export async function syncImapAccount(account: Account, auth: ResolvedAuth): Promise<ImapSyncResult> {
  return withImapClient(account, auth, SYNC_DEADLINE_MS, async (client) => {
    // Primero lo local -> servidor, así el paso de abajo no pisa un cambio que todavía no se envió.
    await flushFlagOps(client, account.id)

    const result: ImapSyncResult = { added: 0, changed: 0 }
    const mailboxes = await client.list()
    for (const mailbox of mailboxes) {
      if (mailbox.flags.has('\\Noselect')) continue

      const kind = mapFolderKind(mailbox.path, mailbox.specialUse, mailbox.name)
      if (!SYNCED_FOLDER_KINDS.has(kind)) continue

      const folderId = upsertFolder(account.id, mailbox.path, mailbox.name, kind)
      try {
        const folderResult = await syncFolder(client, account.id, folderId, mailbox.path, kind)
        result.added += folderResult.added
        result.changed += folderResult.changed
      } catch (error) {
        // Una carpeta rota no tiene que impedir sincronizar las demás... salvo que se haya caído la conexión.
        if (!client.usable) throw error
        console.error(`No se pudo sincronizar ${mailbox.path}:`, error)
      }
    }
    return result
  })
}

// Envía ya mismo los cambios de flags pendientes de una cuenta (lo usa el proceso principal al
// marcar como leído). Sin conexión falla en silencio: los cambios quedan en la cola.
export async function pushPendingFlags(account: Account, auth: ResolvedAuth): Promise<void> {
  if (listPendingFlagOps(account.id).length === 0) return
  await withImapClient(account, auth, QUICK_DEADLINE_MS, (client) => flushFlagOps(client, account.id))
}

export async function appendToImapFolder(
  account: Account,
  auth: ResolvedAuth,
  remotePath: string,
  rawMessage: Buffer
): Promise<void> {
  await withImapClient(account, auth, QUICK_DEADLINE_MS, async (client) => {
    await client.append(remotePath, rawMessage, ['\\Seen'])
  })
}
