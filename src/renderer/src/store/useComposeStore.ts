import { create } from 'zustand'
import type { AttachmentRef } from '@shared/types'

export interface ComposeDraft {
  accountId: string
  to?: string
  cc?: string
  bcc?: string
  subject?: string
  body?: string
  bodyHtml?: string
  inReplyTo?: string
  references?: string[]
  attachments?: AttachmentRef[]
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
