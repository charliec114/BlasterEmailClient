import { create } from 'zustand'
import type { ComposeDraft } from '@shared/types'

export type { ComposeDraft }

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
