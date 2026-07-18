export type AccountProtocol = 'imap' | 'pop3'
export type AuthType = 'password' | 'oauth'

export interface ServerConfig {
  host: string
  port: number
  secure: boolean
  username: string
}

export interface AccountInput {
  displayName: string
  email: string
  protocol: AccountProtocol
  color: string
  signatureHtml: string
  incoming: ServerConfig & { password: string }
  outgoing: ServerConfig & { password: string }
}

export interface Account {
  id: string
  displayName: string
  email: string
  protocol: AccountProtocol
  color: string
  signatureHtml: string
  authType: AuthType
  oauthProvider: string | null
  incoming: ServerConfig
  outgoing: ServerConfig
  createdAt: string
}

export interface ConnectionCheckResult {
  ok: boolean
  error?: string
}

export interface ConnectionTestResult {
  incoming: ConnectionCheckResult
  outgoing: ConnectionCheckResult
}

export interface MailFolder {
  id: string
  accountId: string
  name: string
  kind: 'inbox' | 'sent' | 'drafts' | 'trash' | 'archive' | 'custom'
  unreadCount: number
}

export interface Participant {
  name: string
  email: string
}

export interface AttachmentMeta {
  id: string
  filename: string
  contentType: string | null
  size: number
}

export interface Message {
  id: string
  from: Participant
  to: Participant[]
  cc: Participant[]
  subject: string
  date: string
  bodyText: string
  bodyHtml?: string
  isRead: boolean
  messageId: string
  references: string[]
  attachments: AttachmentMeta[]
}

export interface Thread {
  id: string
  accountId: string
  folderId: string
  subject: string
  participants: Participant[]
  messages: Message[]
  snippet: string
  lastMessageDate: string
  hasUnread: boolean
  isFlagged: boolean
}

export interface StoredSummary {
  summary: string
  lastMessageDate: string
  generatedAt: string
}

export interface Contact {
  email: string
  name: string | null
  lastInteractionAt: string
  interactionCount: number
}

export interface AttachmentRef {
  path: string
  name: string
  size: number
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  url: string
}

export interface SendMailInput {
  accountId: string
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  bodyText: string
  inReplyTo?: string
  references?: string[]
  attachments: AttachmentRef[]
}
