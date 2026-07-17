import { create } from 'zustand'
import type { MailFolder, Thread } from '@shared/types'
import { useSettingsStore } from './useSettingsStore'
import { playNewMailSound } from '../lib/sound'

interface MailDataStore {
  foldersByAccount: Record<string, MailFolder[]>
  threadsByFolder: Record<string, Thread[]>
  syncingAccountIds: string[]
  fetchFolders: (accountId: string) => Promise<void>
  fetchThreads: (accountId: string, folderId: string) => Promise<void>
  syncAccount: (accountId: string) => Promise<void>
  markThreadRead: (accountId: string, folderId: string, threadId: string) => Promise<void>
}

function sumUnread(folders: MailFolder[]): number {
  return folders.reduce((sum, folder) => sum + folder.unreadCount, 0)
}

export const useMailDataStore = create<MailDataStore>((set, get) => ({
  foldersByAccount: {},
  threadsByFolder: {},
  syncingAccountIds: [],

  fetchFolders: async (accountId) => {
    const folders = await window.api.mail.listFolders(accountId)
    set({ foldersByAccount: { ...get().foldersByAccount, [accountId]: folders } })
  },

  fetchThreads: async (accountId, folderId) => {
    const threads = await window.api.mail.listThreads(accountId, folderId)
    set({ threadsByFolder: { ...get().threadsByFolder, [folderId]: threads } })
  },

  syncAccount: async (accountId) => {
    const unreadBefore = sumUnread(get().foldersByAccount[accountId] ?? [])
    set({ syncingAccountIds: [...get().syncingAccountIds, accountId] })
    try {
      await window.api.mail.sync(accountId)
      await get().fetchFolders(accountId)
      const unreadAfter = sumUnread(get().foldersByAccount[accountId] ?? [])
      if (unreadAfter > unreadBefore && useSettingsStore.getState().soundEnabled) {
        playNewMailSound()
      }
    } finally {
      set({ syncingAccountIds: get().syncingAccountIds.filter((id) => id !== accountId) })
    }
  },

  markThreadRead: async (accountId, folderId, threadId) => {
    const threads = get().threadsByFolder[folderId] ?? []
    const thread = threads.find((t) => t.id === threadId)
    if (!thread || !thread.hasUnread) return

    const unreadInThread = thread.messages.filter((m) => !m.isRead).length

    set({
      threadsByFolder: {
        ...get().threadsByFolder,
        [folderId]: threads.map((t) =>
          t.id === threadId
            ? { ...t, hasUnread: false, messages: t.messages.map((m) => ({ ...m, isRead: true })) }
            : t
        )
      },
      foldersByAccount: {
        ...get().foldersByAccount,
        [accountId]: (get().foldersByAccount[accountId] ?? []).map((f) =>
          f.id === folderId ? { ...f, unreadCount: Math.max(0, f.unreadCount - unreadInThread) } : f
        )
      }
    })

    await window.api.mail.markThreadRead(accountId, folderId, threadId)
  }
}))
