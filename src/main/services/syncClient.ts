import { app, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'path'
import syncProcessPath from './syncProcess?modulePath'
import type { SyncProcessRequest, SyncProcessResponse } from './syncProcess'

// Si no hay trabajo por un rato se libera el proceso (y la memoria que retuvo parseando mails).
const IDLE_SHUTDOWN_MS = 2 * 60 * 1000

interface Pending {
  resolve: (value: number) => void
  reject: (error: Error) => void
}

let child: UtilityProcess | null = null
let nextId = 1
let idleTimer: ReturnType<typeof setTimeout> | null = null
const pending = new Map<number, Pending>()

function failAllPending(message: string): void {
  for (const entry of pending.values()) entry.reject(new Error(message))
  pending.clear()
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
    pending.delete(response.id)
    if (response.ok) entry.resolve(response.result)
    else entry.reject(new Error(response.error))
    scheduleIdleShutdown()
  })
  proc.on('exit', (code) => {
    if (child === proc) child = null
    failAllPending(`El proceso de sincronización terminó inesperadamente (código ${code})`)
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
    pending.set(id, { resolve, reject })
    proc.postMessage(request)
  })
}

export function stopSyncProcess(): void {
  if (idleTimer) clearTimeout(idleTimer)
  child?.kill()
  child = null
}
