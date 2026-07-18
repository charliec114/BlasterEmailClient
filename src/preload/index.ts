import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/ipc'
import type {
  Account,
  AccountInput,
  AttachmentRef,
  Contact,
  ConnectionTestResult,
  MailFolder,
  SendMailInput,
  StoredSummary,
  Thread
} from '../shared/types'

const api = {
  accounts: {
    list: (): Promise<Account[]> => ipcRenderer.invoke(IPC.accountsList),
    add: (input: AccountInput): Promise<Account> => ipcRenderer.invoke(IPC.accountsAdd, input),
    update: (id: string, input: AccountInput): Promise<Account> => ipcRenderer.invoke(IPC.accountsUpdate, id, input),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.accountsRemove, id),
    testConnection: (input: AccountInput, accountId?: string): Promise<ConnectionTestResult> =>
      ipcRenderer.invoke(IPC.accountsTestConnection, input, accountId),
    connectGoogle: (): Promise<Account> => ipcRenderer.invoke(IPC.accountsConnectGoogle)
  },
  mail: {
    sync: (accountId: string): Promise<void> => ipcRenderer.invoke(IPC.syncRun, accountId),
    listFolders: (accountId: string): Promise<MailFolder[]> => ipcRenderer.invoke(IPC.mailListFolders, accountId),
    listThreads: (accountId: string, folderId: string): Promise<Thread[]> =>
      ipcRenderer.invoke(IPC.mailListThreads, accountId, folderId),
    listUnifiedInbox: (): Promise<Thread[]> => ipcRenderer.invoke(IPC.mailListUnifiedInbox),
    send: (input: SendMailInput): Promise<void> => ipcRenderer.invoke(IPC.mailSend, input),
    markThreadRead: (accountId: string, folderId: string, threadId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.mailMarkThreadRead, accountId, folderId, threadId),
    saveAttachment: (attachmentId: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC.mailSaveAttachment, attachmentId)
  },
  settings: {
    getAll: (): Promise<Record<string, string>> => ipcRenderer.invoke(IPC.settingsGetAll),
    set: (key: string, value: string): Promise<void> => ipcRenderer.invoke(IPC.settingsSet, key, value)
  },
  ollama: {
    listModels: (baseUrl: string): Promise<string[]> => ipcRenderer.invoke(IPC.ollamaListModels, baseUrl),
    getSummary: (threadKey: string): Promise<StoredSummary | null> =>
      ipcRenderer.invoke(IPC.ollamaGetSummary, threadKey),
    summarizeThread: (threadKey: string, lastMessageDate: string, threadText: string): Promise<string> =>
      ipcRenderer.invoke(IPC.ollamaSummarizeThread, threadKey, lastMessageDate, threadText),
    composeAssist: (instruction: string, context: string, currentBody: string): Promise<string> =>
      ipcRenderer.invoke(IPC.ollamaComposeAssist, instruction, context, currentBody),
    suggestSubject: (context: string, body: string): Promise<string> =>
      ipcRenderer.invoke(IPC.ollamaSuggestSubject, context, body)
  },
  contacts: {
    search: (query: string): Promise<Contact[]> => ipcRenderer.invoke(IPC.contactsSearch, query),
    list: (): Promise<Contact[]> => ipcRenderer.invoke(IPC.contactsList),
    remove: (email: string): Promise<void> => ipcRenderer.invoke(IPC.contactsRemove, email)
  },
  dialog: {
    pickFiles: (): Promise<AttachmentRef[]> => ipcRenderer.invoke(IPC.dialogPickFiles)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
