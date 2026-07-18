import { create } from 'zustand'
import type { MailFolder, Thread } from '@shared/types'
import { useSettingsStore } from './useSettingsStore'
import { playNewMailSound } from '../lib/sound'

interface MailDataStore {
  foldersByAccount: Record<string, MailFolder[]>
  threadsByFolder: Record<string, Thread[]>
  unifiedInboxThreads: Thread[]
  syncingAccountIds: string[]
  fetchFolders: (accountId: string) => Promise<void>
  fetchThreads: (accountId: string, folderId: string) => Promise<void>
  fetchUnifiedInbox: () => Promise<void>
  syncAccount: (accountId: string) => Promise<void>
  markThreadRead: (accountId: string, folderId: string, threadId: string) => Promise<void>
}

function sumUnread(folders: MailFolder[]): number {
  return folders.reduce((sum, folder) => sum + folder.unreadCount, 0)
}

export const useMailDataStore = create<MailDataStore>((set, get) => ({
  foldersByAccount: {},
  threadsByFolder: {},
  unifiedInboxThreads: [],
  syncingAccountIds: [],

  fetchFolders: async (accountId) => {
    const folders = await window.api.mail.listFolders(accountId)
    set({ foldersByAccount: { ...get().foldersByAccount, [accountId]: folders } })
  },

  fetchThreads: async (accountId, folderId) => {
    const threads = await window.api.mail.listThreads(accountId, folderId)
    set({ threadsByFolder: { ...get().threadsByFolder, [folderId]: threads } })
  },

  fetchUnifiedInbox: async () => {
    const threads = await window.api.mail.listUnifiedInbox()
    set({ unifiedInboxThreads: threads })
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
    const thread =
      threads.find((t) => t.id === threadId) ?? get().unifiedInboxThreads.find((t) => t.id === threadId)
    if (!thread || !thread.hasUnread) return

    const unreadInThread = thread.messages.filter((m) => !m.isRead).length

    const markRead = (t: Thread): Thread =>
      t.id === threadId ? { ...t, hasUnread: false, messages: t.messages.map((m) => ({ ...m, isRead: true })) } : t

    set({
      threadsByFolder: { ...get().threadsByFolder, [folderId]: threads.map(markRead) },
      unifiedInboxThreads: get().unifiedInboxThreads.map(markRead),
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
