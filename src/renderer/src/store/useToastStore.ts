import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
  action?: { label: string; onClick: () => void }
}

interface ToastStore {
  toasts: Toast[]
  show: (toast: Omit<Toast, 'id'>, durationMs?: number) => number
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  // durationMs = 0 deja el aviso fijo hasta que se lo descarte (ej. "Enviando...", errores).
  show: (toast, durationMs = 4000) => {
    const id = nextId++
    set({ toasts: [...get().toasts, { ...toast, id }] })
    if (durationMs > 0) setTimeout(() => get().dismiss(id), durationMs)
    return id
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) })
}))
