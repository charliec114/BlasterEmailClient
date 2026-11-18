// Errores de red que significan "no hay conexión (todavía)", no "el servidor rechazó el pedido".
const OFFLINE_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENETDOWN',
  'EDNS',
  'ETIMEDOUT',
  'ECONNRESET',
  'ESOCKET',
  'ECONNECTION',
  'EPIPE',
  'NoConnection'
])

// Cuando se cae la conexión *durante* el DATA de SMTP no se sabe si el servidor aceptó el mensaje;
// reencolarlo podría duplicarlo. Para el envío sólo se reintenta si ni siquiera se llegó a conectar.
const NEVER_CONNECTED_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ENETDOWN', 'EDNS'])

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : undefined
}

export function isNetworkError(error: unknown): boolean {
  const code = errorCode(error)
  if (code && OFFLINE_CODES.has(code)) return true
  const message = error instanceof Error ? error.message : String(error)
  return /getaddrinfo|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|network is unreachable|socket hang up|timed? ?out|Connection not available|Failed to fetch|fetch failed/i.test(
    message
  )
}

// ¿El fallo ocurrió antes de establecer conexión con el servidor? (seguro de reintentar sin duplicar)
export function isNeverConnectedError(error: unknown): boolean {
  const code = errorCode(error)
  if (code && NEVER_CONNECTED_CODES.has(code)) return true
  if ((error as { command?: unknown } | null)?.command === 'CONN') return true
  const message = error instanceof Error ? error.message : String(error)
  return /getaddrinfo|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|network is unreachable/i.test(message)
}

// Corta una operación que no termina (socket muerto tras suspender la máquina, servidor que no
// responde). `onTimeout` debe liberar el recurso (cerrar el socket) para que no quede colgado.
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        onTimeout?.()
      } catch {
        // ignorado: el rechazo de abajo es lo que importa
      }
      reject(new Error(`${label}: se agotó el tiempo de espera (${Math.round(ms / 1000)} s)`))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}
