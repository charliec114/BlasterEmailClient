import { create } from 'zustand'

export interface ComposeDraft {
  accountId: string
  to?: string
  cc?: string
  subject?: string
  body?: string
  inReplyTo?: string
  references?: string[]
  context?: string
}

interface ComposeStore {
  draft: ComposeDraft | null
  openCompose: (draft: ComposeDraft) => void
  closeCompose: () => void
}

export const useComposeStore = create<ComposeStore>((set) => ({
  draft: null,
  openCompose: (draft) => set({ draft }),
  closeCompose: () => set({ draft: null })
}))
