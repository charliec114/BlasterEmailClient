import { useEffect, useState } from 'react'

// navigator.onLine sólo detecta "sin red local": con wifi pero sin internet dice true. Sirve
// igual para el aviso; los fallos reales de red se manejan donde ocurren (sync, envío).
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = (): void => setOnline(true)
    const down = (): void => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}
