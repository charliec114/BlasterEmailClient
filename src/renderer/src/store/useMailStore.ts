import { create } from 'zustand'

interface MailStore {
  selectedAccountId: string | null
  selectedFolderId: string | null
  selectedFolderName: string | null
  selectedThreadId: string | null
  selectFolder: (accountId: string, folderId: string, folderName: string) => void
  selectThread: (threadId: string) => void
}

export const useMailStore = create<MailStore>((set) => ({
  selectedAccountId: null,
  selectedFolderId: null,
  selectedFolderName: null,
  selectedThreadId: null,
  selectFolder: (accountId, folderId, folderName) =>
    set({ selectedAccountId: accountId, selectedFolderId: folderId, selectedFolderName: folderName, selectedThreadId: null }),
  selectThread: (threadId) => set({ selectedThreadId: threadId })
}))
