import { app, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'path'
import syncProcessPath from './syncProcess?modulePath'
import type { SyncProcessRequest, SyncProcessResponse } from './syncProcess'

// Si no hay trabajo por un rato se libera el proceso (y la memoria que retuvo parseando mails).
const IDLE_SHUTDOWN_MS = 2 * 60 * 1000

// Tope duro por pedido: si el proceso de sync se cuelga (socket muerto, servidor que no contesta)
// se lo mata. Sin esto la promesa nunca se resolvía y la cuenta quedaba "sincronizando" para
// siempre, así que ningún sync posterior volvía a correr hasta reiniciar la app.
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000

interface Pending {
  proc: UtilityProcess
  timer: ReturnType<typeof setTimeout>
  resolve: (value: number) => void
  reject: (error: Error) => void
}

let child: UtilityProcess | null = null
let nextId = 1
let idleTimer: ReturnType<typeof setTimeout> | null = null
const pending = new Map<number, Pending>()

// Sólo los pedidos de ESE proceso: el `exit` de uno viejo (matado por inactividad o por timeout)
// llega de forma asíncrona, cuando ya puede haber uno nuevo atendiendo pedidos.
function failPendingOf(proc: UtilityProcess, message: string): void {
  for (const [id, entry] of pending) {
    if (entry.proc !== proc) continue
    clearTimeout(entry.timer)
    pending.delete(id)
    entry.reject(new Error(message))
  }
}

function scheduleIdleShutdown(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  if (pending.size > 0) return
  idleTimer = setTimeout(() => {
    child?.kill()
    child = null
  }, IDLE_SHUTDOWN_MS)
}

function ensureProcess(): UtilityProcess {
  if (child) return child

  const proc = utilityProcess.fork(syncProcessPath, [], { serviceName: 'Blaster sync' })
  proc.on('message', (response: SyncProcessResponse) => {
    const entry = pending.get(response.id)
    if (!entry) return
    clearTimeout(entry.timer)
    pending.delete(response.id)
    if (response.ok) entry.resolve(response.result)
    else entry.reject(new Error(response.error))
    scheduleIdleShutdown()
  })
  proc.on('exit', (code) => {
    if (child === proc) child = null
    failPendingOf(proc, `El proceso de sincronización terminó inesperadamente (código ${code})`)
    scheduleIdleShutdown()
  })
  child = proc
  return proc
}

type RequestBody = SyncProcessRequest extends infer R ? (R extends unknown ? Omit<R, 'id' | 'dbPath'> : never) : never

export function runInSyncProcess(body: RequestBody): Promise<number> {
  if (idleTimer) clearTimeout(idleTimer)
  const proc = ensureProcess()
  const id = nextId++
  const request = { ...body, id, dbPath: join(app.getPath('userData'), 'blaster.db') } as SyncProcessRequest
  return new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pending.has(id)) return
      // Se mata el proceso entero: el trabajo colgado no se puede cancelar desde afuera.
      if (child === proc) child = null
      proc.kill()
      failPendingOf(proc, 'La sincronización tardó demasiado y fue cancelada')
    }, REQUEST_TIMEOUT_MS)
    pending.set(id, { proc, timer, resolve, reject })
    proc.postMessage(request)
  })
}

export function stopSyncProcess(): void {
  if (idleTimer) clearTimeout(idleTimer)
  child?.kill()
  child = null
}
