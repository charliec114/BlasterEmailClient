import { create } from 'zustand'

export const UNIFIED_INBOX_ID = 'unified-inbox'
export const ASSISTANT_VIEW_ID = 'assistant-view'

interface MailStore {
  selectedAccountId: string | null
  selectedFolderId: string | null
  selectedFolderName: string | null
  selectedThreadId: string | null
  selectFolder: (accountId: string, folderId: string, folderName: string) => void
  selectUnifiedInbox: (label: string) => void
  selectAssistantView: () => void
  selectThread: (threadId: string) => void
}

export const useMailStore = create<MailStore>((set) => ({
  selectedAccountId: null,
  selectedFolderId: null,
  selectedFolderName: null,
  selectedThreadId: null,
  selectFolder: (accountId, folderId, folderName) =>
    set({ selectedAccountId: accountId, selectedFolderId: folderId, selectedFolderName: folderName, selectedThreadId: null }),
  selectUnifiedInbox: (label) =>
    set({ selectedAccountId: null, selectedFolderId: UNIFIED_INBOX_ID, selectedFolderName: label, selectedThreadId: null }),
  selectAssistantView: () =>
    set({ selectedAccountId: null, selectedFolderId: ASSISTANT_VIEW_ID, selectedFolderName: null, selectedThreadId: null }),
  selectThread: (threadId) => set({ selectedThreadId: threadId })
}))
