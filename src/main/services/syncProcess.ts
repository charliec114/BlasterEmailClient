// Entrada del proceso de sincronización (un utilityProcess de Electron, ver syncClient.ts).
//
// Todo lo pesado de traer correo — parsear MIME, escribir miles de filas en SQLite (con sus
// triggers de FTS5), re-threadear — vive acá y no en el proceso principal. Ese proceso también
// atiende el bucle de eventos de la ventana: si se bloquea, el SO muestra "la aplicación no
// responde". Acá no hay `electron` (sin safeStorage, sin OAuth): las credenciales llegan ya
// resueltas en cada pedido.
import { configureDb, getDb } from '../db'
import { syncImapAccount } from './imapSync'
import { syncPop3Account } from './pop3Sync'
import { rethreadAccount } from './threading'
import { getSetting, setSetting } from './settingsRepository'
import { backfillContactsFromMessages } from './contactsRepository'
import type { ResolvedAuth } from './authResolver'
import type { Account } from '@shared/types'

const RETHREAD_BACKFILL_DONE_PREFIX = 'threadBackfillDone:'
const RETHREAD_RECENT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000

export type SyncProcessRequest =
  | { id: number; task: 'sync'; dbPath: string; account: Account; imapAuth?: ResolvedAuth; pop3Password?: string }
  | { id: number; task: 'backfillContacts'; dbPath: string }

export type SyncProcessResponse = { id: number; ok: true; result: number } | { id: number; ok: false; error: string }

async function syncAccount(account: Account, imapAuth?: ResolvedAuth, pop3Password?: string): Promise<number> {
  let newMessageCount: number
  if (account.protocol === 'imap') {
    if (!imapAuth) throw new Error('Falta la autenticación IMAP')
    newMessageCount = await syncImapAccount(account, imapAuth)
  } else {
    newMessageCount = await syncPop3Account(account, pop3Password ?? '')
  }

  // Re-threadear sólo vale la pena pagarlo cuando efectivamente llegó mail nuevo. La mayoría
  // de los syncs automáticos (cada 5 min, sin nada nuevo) no tocan la base para nada.
  if (newMessageCount > 0) {
    const backfillFlag = `${RETHREAD_BACKFILL_DONE_PREFIX}${account.id}`
    if (getSetting(backfillFlag)) {
      // Cuenta ya prolijada una vez: de acá en más alcanza con recalcular lo reciente
      // (ver comentario en threading.ts) — el costo ya no crece con el historial total.
      const sinceIso = new Date(Date.now() - RETHREAD_RECENT_WINDOW_MS).toISOString()
      rethreadAccount(getDb(), account.id, sinceIso)
    } else {
      rethreadAccount(getDb(), account.id)
      setSetting(backfillFlag, 'true')
    }
  }

  return newMessageCount
}

async function handle(request: SyncProcessRequest): Promise<number> {
  configureDb(request.dbPath, { migrate: false })
  if (request.task === 'sync') return syncAccount(request.account, request.imapAuth, request.pop3Password)
  backfillContactsFromMessages()
  return 0
}

process.parentPort.on('message', async (event) => {
  const request = event.data as SyncProcessRequest
  let response: SyncProcessResponse
  try {
    response = { id: request.id, ok: true, result: await handle(request) }
  } catch (error) {
    response = { id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  process.parentPort.postMessage(response)
})
