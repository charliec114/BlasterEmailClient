import { create } from 'zustand'
import type { ScheduledMail } from '@shared/types'

interface ScheduledMailStore {
  items: ScheduledMail[]
  loading: boolean
  fetch: () => Promise<void>
  cancel: (id: string) => Promise<void>
  sendNow: (id: string) => Promise<void>
}

export const useScheduledMailStore = create<ScheduledMailStore>((set, get) => ({
  items: [],
  loading: false,

  fetch: async () => {
    set({ loading: true })
    try {
      const items = await window.api.scheduledMail.list()
      set({ items, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  cancel: async (id) => {
    await window.api.scheduledMail.cancel(id)
    set({ items: get().items.filter((item) => item.id !== id) })
  },

  sendNow: async (id) => {
    await window.api.scheduledMail.sendNow(id)
    await get().fetch()
  }
}))
