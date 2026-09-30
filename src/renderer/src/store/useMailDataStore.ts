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
  threadDetails: Record<string, Thread>
  syncingAccountIds: string[]
  searchQuery: string
  searchResults: Thread[]
  searching: boolean
  fetchFolders: (accountId: string) => Promise<void>
  fetchThreads: (accountId: string, folderId: string) => Promise<void>
  fetchUnifiedInbox: () => Promise<void>
  fetchThreadDetail: (accountId: string, threadId: string) => Promise<void>
  syncAccount: (accountId: string) => Promise<number>
  markThreadRead: (accountId: string, folderId: string, threadId: string) => Promise<void>
  markFolderRead: (accountId: string, folderId: string) => Promise<void>
  search: (query: string) => Promise<void>
  clearSearch: () => void
}

// Cada refresco trae la lista completa desde main. Los hilos que no cambiaron conservan su
// referencia anterior, así las filas memoizadas de MessageList no se vuelven a renderizar.
function reuseUnchangedThreads(previous: Thread[] | undefined, next: Thread[]): Thread[] {
  if (!previous || previous.length === 0) return next
  const previousById = new Map(previous.map((t) => [t.id, t]))
  return next.map((thread) => {
    const old = previousById.get(thread.id)
    return old &&
      old.lastMessageDate === thread.lastMessageDate &&
      old.hasUnread === thread.hasUnread &&
      old.isFlagged === thread.isFlagged &&
      old.snippet === thread.snippet &&
      old.folderId === thread.folderId &&
      old.messages.length === thread.messages.length
      ? old
      : thread
  })
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
  threadDetails: {},
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
    set({ threadsByFolder: { ...get().threadsByFolder, [folderId]: reuseUnchangedThreads(get().threadsByFolder[folderId], threads) } })
  },

  fetchUnifiedInbox: async () => {
    const threads = await window.api.mail.listUnifiedInbox()
    set({ unifiedInboxThreads: reuseUnchangedThreads(get().unifiedInboxThreads, threads) })
  },

  // Los listados (fetchThreads/fetchUnifiedInbox/search) traen los hilos livianos, sin el
  // body de los mensajes — esto pide el detalle completo de un hilo puntual (ver
  // getThreadDetail en mailRepository.ts), sólo cuando el usuario lo abre en el Reading Pane.
  fetchThreadDetail: async (accountId, threadId) => {
    const thread = await window.api.mail.getThread(accountId, threadId)
    if (!thread) return
    set({ threadDetails: { ...get().threadDetails, [threadId]: thread } })
  },

  // Devuelve cuántos mensajes nuevos trajo el sync. Si fue 0 no hay nada que refrescar (ni
  // carpetas ni listados), que es el caso normal del sync automático cada 5 minutos.
  syncAccount: async (accountId) => {
    if (get().syncingAccountIds.includes(accountId)) return 0
    const unreadBefore = sumUnread(get().foldersByAccount[accountId] ?? [])
    set({ syncingAccountIds: [...get().syncingAccountIds, accountId] })
    try {
      const newCount = await window.api.mail.sync(accountId)
      // Sin carpetas cargadas todavía (primer sync) hay que traerlas igual aunque no haya mail nuevo.
      if (newCount > 0 || !get().foldersByAccount[accountId]) {
        await get().fetchFolders(accountId)
      }
      // Los mensajes nuevos también pueden ser de Enviados (ya leídos): se avisa sólo por no leídos.
      const newUnread = sumUnread(get().foldersByAccount[accountId] ?? []) - unreadBefore
      if (newCount > 0 && newUnread > 0) {
        const settings = useSettingsStore.getState()
        if (settings.soundEnabled) playNewMailSound()
        if (settings.notificationsEnabled) {
          const account = useAccountStore.getState().accounts.find((a) => a.id === accountId)
          const senderName = await latestUnreadSender(accountId, get().foldersByAccount[accountId] ?? [])
          notifyNewMail(newUnread, account?.label, senderName)
        }
      }
      return newCount
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
