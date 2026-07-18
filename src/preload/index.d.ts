import { ElectronAPI } from '@electron-toolkit/preload'
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

interface BlasterApi {
  accounts: {
    list: () => Promise<Account[]>
    add: (input: AccountInput) => Promise<Account>
    update: (id: string, input: AccountInput) => Promise<Account>
    remove: (id: string) => Promise<void>
    testConnection: (input: AccountInput, accountId?: string) => Promise<ConnectionTestResult>
    connectGoogle: () => Promise<Account>
  }
  mail: {
    sync: (accountId: string) => Promise<void>
    listFolders: (accountId: string) => Promise<MailFolder[]>
    listThreads: (accountId: string, folderId: string) => Promise<Thread[]>
    listUnifiedInbox: () => Promise<Thread[]>
    send: (input: SendMailInput) => Promise<void>
    markThreadRead: (accountId: string, folderId: string, threadId: string) => Promise<void>
    saveAttachment: (attachmentId: string) => Promise<string | null>
  }
  settings: {
    getAll: () => Promise<Record<string, string>>
    set: (key: string, value: string) => Promise<void>
  }
  ollama: {
    listModels: (baseUrl: string) => Promise<string[]>
    getSummary: (threadKey: string) => Promise<StoredSummary | null>
    summarizeThread: (threadKey: string, lastMessageDate: string, threadText: string) => Promise<string>
    composeAssist: (instruction: string, context: string, currentBody: string) => Promise<string>
    suggestSubject: (context: string, body: string) => Promise<string>
  }
  contacts: {
    search: (query: string) => Promise<Contact[]>
    list: () => Promise<Contact[]>
    remove: (email: string) => Promise<void>
    update: (currentEmail: string, name: string, newEmail: string) => Promise<Contact>
  }
  apiKeys: {
    setKey: (provider: string, key: string) => Promise<void>
    getStatus: () => Promise<Record<string, boolean>>
  }
  dialog: {
    pickFiles: () => Promise<AttachmentRef[]>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: BlasterApi
  }
}
