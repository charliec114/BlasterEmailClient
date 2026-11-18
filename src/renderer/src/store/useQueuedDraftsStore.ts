import { create } from 'zustand'
import type { ComposeDraft, QueuedDraft } from '@shared/types'

interface QueuedDraftsStore {
  items: QueuedDraft[]
  loading: boolean
  // Devuelve cuántos borradores hay ahora (para que quien llama pueda avisar si aumentaron).
  fetch: () => Promise<number>
  discard: (id: string) => Promise<void>
  save: (id: string, draft: ComposeDraft) => Promise<void>
}

export const useQueuedDraftsStore = create<QueuedDraftsStore>((set, get) => ({
  items: [],
  loading: false,

  fetch: async () => {
    set({ loading: true })
    try {
      const items = await window.api.mcp.listDrafts()
      set({ items, loading: false })
      return items.length
    } catch {
      set({ loading: false })
      return get().items.length
    }
  },

  discard: async (id) => {
    await window.api.mcp.discardDraft(id)
    set({ items: get().items.filter((item) => item.id !== id) })
  },

  save: async (id, draft) => {
    await window.api.mcp.updateDraft(id, draft)
    await get().fetch()
  }
}))
