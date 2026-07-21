import { create } from 'zustand'
import type { MailFolder, Thread } from '@shared/types'
import { useSettingsStore } from './useSettingsStore'
import { useAccountStore } from './useAccountStore'
import { playNewMailSound } from '../lib/sound'
import { notifyNewMail } from '../lib/notifications'

interface MailDataStore {
  foldersByAccount: Record<string, MailFolder[]>
  threadsByFolder: Record<string, Thread[]>
  unifiedInboxThreads: Thread[]
  syncingAccountIds: string[]
  searchQuery: string
  searchResults: Thread[]
  searching: boolean
  fetchFolders: (accountId: string) => Promise<void>
  fetchThreads: (accountId: string, folderId: string) => Promise<void>
  fetchUnifiedInbox: () => Promise<void>
  syncAccount: (accountId: string) => Promise<void>
  markThreadRead: (accountId: string, folderId: string, threadId: string) => Promise<void>
  markFolderRead: (accountId: string, folderId: string) => Promise<void>
  search: (query: string) => Promise<void>
  clearSearch: () => void
}

function sumUnread(folders: MailFolder[]): number {
  return folders.reduce((sum, folder) => sum + folder.unreadCount, 0)
}

// Para poder avisar "nuevo mensaje de {remitente}" en la notificación, buscamos el hilo no
// leído más reciente de la bandeja de entrada — no hace falta guardar cache, es un llamado
// puntual que se descarta después de armar la notificación.
async function latestUnreadSender(accountId: string, folders: MailFolder[]): Promise<string | undefined> {
  const inboxFolder = folders.find((f) => f.kind === 'inbox')
  if (!inboxFolder) return undefined
  try {
    const threads = await window.api.mail.listThreads(accountId, inboxFolder.id)
    const latestUnread = threads
      .filter((t) => t.hasUnread)
      .sort((a, b) => new Date(b.lastMessageDate).getTime() - new Date(a.lastMessageDate).getTime())[0]
    if (!latestUnread) return undefined
    const lastMessage = latestUnread.messages[latestUnread.messages.length - 1]
    return lastMessage.from.name || lastMessage.from.email || undefined
  } catch {
    return undefined
  }
}

export const useMailDataStore = create<MailDataStore>((set, get) => ({
  foldersByAccount: {},
  threadsByFolder: {},
  unifiedInboxThreads: [],
  syncingAccountIds: [],
  searchQuery: '',
  searchResults: [],
  searching: false,

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
      const newCount = unreadAfter - unreadBefore
      if (newCount > 0) {
        const settings = useSettingsStore.getState()
        if (settings.soundEnabled) playNewMailSound()
        if (settings.notificationsEnabled) {
          const account = useAccountStore.getState().accounts.find((a) => a.id === accountId)
          const senderName = await latestUnreadSender(accountId, get().foldersByAccount[accountId] ?? [])
          notifyNewMail(newCount, account?.displayName, senderName)
        }
      }
    } finally {
      set({ syncingAccountIds: get().syncingAccountIds.filter((id) => id !== accountId) })
    }
  },

  markThreadRead: async (accountId, folderId, threadId) => {
    const threads = get().threadsByFolder[folderId] ?? []
    const thread =
      threads.find((t) => t.id === threadId) ??
      get().unifiedInboxThreads.find((t) => t.id === threadId) ??
      get().searchResults.find((t) => t.id === threadId)
    if (!thread || !thread.hasUnread) return

    const unreadInThread = thread.messages.filter((m) => !m.isRead).length

    const markRead = (t: Thread): Thread =>
      t.id === threadId ? { ...t, hasUnread: false, messages: t.messages.map((m) => ({ ...m, isRead: true })) } : t

    set({
      threadsByFolder: { ...get().threadsByFolder, [folderId]: threads.map(markRead) },
      unifiedInboxThreads: get().unifiedInboxThreads.map(markRead),
      searchResults: get().searchResults.map(markRead),
      foldersByAccount: {
        ...get().foldersByAccount,
        [accountId]: (get().foldersByAccount[accountId] ?? []).map((f) =>
          f.id === folderId ? { ...f, unreadCount: Math.max(0, f.unreadCount - unreadInThread) } : f
        )
      }
    })

    await window.api.mail.markThreadRead(accountId, folderId, threadId)
  },

  markFolderRead: async (accountId, folderId) => {
    const markAllRead = (t: Thread): Thread =>
      t.folderId === folderId ? { ...t, hasUnread: false, messages: t.messages.map((m) => ({ ...m, isRead: true })) } : t

    set({
      threadsByFolder: { ...get().threadsByFolder, [folderId]: (get().threadsByFolder[folderId] ?? []).map(markAllRead) },
      unifiedInboxThreads: get().unifiedInboxThreads.map(markAllRead),
      searchResults: get().searchResults.map(markAllRead),
      foldersByAccount: {
        ...get().foldersByAccount,
        [accountId]: (get().foldersByAccount[accountId] ?? []).map((f) => (f.id === folderId ? { ...f, unreadCount: 0 } : f))
      }
    })

    await window.api.mail.markFolderRead(accountId, folderId)
  },

  search: async (query) => {
    set({ searchQuery: query })
    if (!query.trim()) {
      set({ searchResults: [], searching: false })
      return
    }
    set({ searching: true })
    try {
      const results = await window.api.mail.search(query)
      set({ searchResults: results, searching: false })
    } catch {
      set({ searchResults: [], searching: false })
    }
  },

  clearSearch: () => set({ searchQuery: '', searchResults: [] })
}))
