import { create } from 'zustand'

export const UNIFIED_INBOX_ID = 'unified-inbox'

interface MailStore {
  selectedAccountId: string | null
  selectedFolderId: string | null
  selectedFolderName: string | null
  selectedThreadId: string | null
  selectFolder: (accountId: string, folderId: string, folderName: string) => void
  selectUnifiedInbox: (label: string) => void
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
  selectThread: (threadId) => set({ selectedThreadId: threadId })
}))
