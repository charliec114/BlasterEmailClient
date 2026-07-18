import { randomUUID } from 'crypto'
import { getDb } from '../db'
import { encryptSecret, decryptSecret } from './secretStorage'
import type { Account, AccountInput, AccountProtocol, AuthType } from '@shared/types'

const ACCOUNT_COLORS = ['#0a84ff', '#ff9f0a', '#30d158', '#ff375f', '#bf5af2', '#64d2ff']

interface AccountRow {
  id: string
  display_name: string
  email: string
  protocol: AccountProtocol
  color: string
  incoming_host: string
  incoming_port: number
  incoming_secure: number
  incoming_username: string
  incoming_password_enc: Buffer
  outgoing_host: string
  outgoing_port: number
  outgoing_secure: number
  outgoing_username: string
  outgoing_password_enc: Buffer
  signature_html: string | null
  auth_type: AuthType
  oauth_provider: string | null
  oauth_refresh_token_enc: Buffer | null
  created_at: string
}

function rowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    protocol: row.protocol,
    color: row.color,
    signatureHtml: row.signature_html ?? '',
    authType: row.auth_type,
    oauthProvider: row.oauth_provider,
    createdAt: row.created_at,
    incoming: {
      host: row.incoming_host,
      port: row.incoming_port,
      secure: Boolean(row.incoming_secure),
      username: row.incoming_username
    },
    outgoing: {
      host: row.outgoing_host,
      port: row.outgoing_port,
      secure: Boolean(row.outgoing_secure),
      username: row.outgoing_username
    }
  }
}

function getAccountRow(id: string): AccountRow {
  const row = getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined
  if (!row) {
    throw new Error(`Cuenta no encontrada: ${id}`)
  }
  return row
}

function assertEmailNotInUse(email: string, excludeId?: string): void {
  const normalized = email.trim().toLowerCase()
  const row = getDb()
    .prepare('SELECT id FROM accounts WHERE lower(email) = ?')
    .get(normalized) as { id: string } | undefined
  if (row && row.id !== excludeId) {
    throw new Error(`Ya tenés una cuenta agregada con el email ${email}.`)
  }
}

export function listAccounts(): Account[] {
  const rows = getDb().prepare('SELECT * FROM accounts ORDER BY created_at ASC').all() as AccountRow[]
  return rows.map(rowToAccount)
}

export function getAccountById(id: string): Account {
  return rowToAccount(getAccountRow(id))
}

export function getIncomingPassword(id: string): string {
  return decryptSecret(getAccountRow(id).incoming_password_enc)
}

export function getOutgoingPassword(id: string): string {
  return decryptSecret(getAccountRow(id).outgoing_password_enc)
}

// Password vacío en el input = "no cambiar", se completa con el valor ya guardado.
export function resolveAccountPasswords(id: string, input: AccountInput): AccountInput {
  const row = getAccountRow(id)
  return {
    ...input,
    incoming: {
      ...input.incoming,
      password: input.incoming.password || decryptSecret(row.incoming_password_enc)
    },
    outgoing: {
      ...input.outgoing,
      password: input.outgoing.password || decryptSecret(row.outgoing_password_enc)
    }
  }
}

export function addAccount(input: AccountInput): Account {
  assertEmailNotInUse(input.email)

  const id = randomUUID()
  const createdAt = new Date().toISOString()

  getDb()
    .prepare(
      `INSERT INTO accounts (
        id, display_name, email, protocol, color, signature_html,
        incoming_host, incoming_port, incoming_secure, incoming_username, incoming_password_enc,
        outgoing_host, outgoing_port, outgoing_secure, outgoing_username, outgoing_password_enc,
        created_at
      ) VALUES (
        @id, @displayName, @email, @protocol, @color, @signatureHtml,
        @incomingHost, @incomingPort, @incomingSecure, @incomingUsername, @incomingPasswordEnc,
        @outgoingHost, @outgoingPort, @outgoingSecure, @outgoingUsername, @outgoingPasswordEnc,
        @createdAt
      )`
    )
    .run({
      id,
      displayName: input.displayName,
      email: input.email,
      protocol: input.protocol,
      color: input.color,
      signatureHtml: input.signatureHtml,
      incomingHost: input.incoming.host,
      incomingPort: input.incoming.port,
      incomingSecure: input.incoming.secure ? 1 : 0,
      incomingUsername: input.incoming.username,
      incomingPasswordEnc: encryptSecret(input.incoming.password),
      outgoingHost: input.outgoing.host,
      outgoingPort: input.outgoing.port,
      outgoingSecure: input.outgoing.secure ? 1 : 0,
      outgoingUsername: input.outgoing.username,
      outgoingPasswordEnc: encryptSecret(input.outgoing.password),
      createdAt
    })

  const row = getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow
  return rowToAccount(row)
}

export function updateAccount(id: string, input: AccountInput): Account {
  assertEmailNotInUse(input.email, id)
  const existing = getAccountRow(id)

  getDb()
    .prepare(
      `UPDATE accounts SET
        display_name = @displayName,
        email = @email,
        protocol = @protocol,
        color = @color,
        signature_html = @signatureHtml,
        incoming_host = @incomingHost,
        incoming_port = @incomingPort,
        incoming_secure = @incomingSecure,
        incoming_username = @incomingUsername,
        incoming_password_enc = @incomingPasswordEnc,
        outgoing_host = @outgoingHost,
        outgoing_port = @outgoingPort,
        outgoing_secure = @outgoingSecure,
        outgoing_username = @outgoingUsername,
        outgoing_password_enc = @outgoingPasswordEnc
      WHERE id = @id`
    )
    .run({
      id,
      displayName: input.displayName,
      email: input.email,
      protocol: input.protocol,
      color: input.color,
      signatureHtml: input.signatureHtml,
      incomingHost: input.incoming.host,
      incomingPort: input.incoming.port,
      incomingSecure: input.incoming.secure ? 1 : 0,
      incomingUsername: input.incoming.username,
      incomingPasswordEnc: input.incoming.password ? encryptSecret(input.incoming.password) : existing.incoming_password_enc,
      outgoingHost: input.outgoing.host,
      outgoingPort: input.outgoing.port,
      outgoingSecure: input.outgoing.secure ? 1 : 0,
      outgoingUsername: input.outgoing.username,
      outgoingPasswordEnc: input.outgoing.password ? encryptSecret(input.outgoing.password) : existing.outgoing_password_enc
    })

  return rowToAccount(getAccountRow(id))
}

export function removeAccount(id: string): void {
  const db = getDb()

  const deleteAll = db.transaction((accountId: string) => {
    const threadKeys = db
      .prepare('SELECT DISTINCT thread_key FROM messages WHERE account_id = ?')
      .all(accountId) as { thread_key: string }[]
    const messageIds = db.prepare('SELECT id FROM messages WHERE account_id = ?').all(accountId) as { id: string }[]

    if (messageIds.length > 0) {
      const placeholders = messageIds.map(() => '?').join(',')
      db.prepare(`DELETE FROM attachments WHERE message_id IN (${placeholders})`).run(...messageIds.map((m) => m.id))
    }
    for (const { thread_key } of threadKeys) {
      db.prepare('DELETE FROM thread_summaries WHERE thread_key = ?').run(thread_key)
    }
    db.prepare('DELETE FROM messages WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM folders WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId)
  })

  deleteAll(id)
}

export function addGoogleAccount(email: string, name: string, refreshToken: string): Account {
  assertEmailNotInUse(email)

  const id = randomUUID()
  const createdAt = new Date().toISOString()
  const color = ACCOUNT_COLORS[Math.floor(Math.random() * ACCOUNT_COLORS.length)]
  const emptyPassword = encryptSecret('')

  getDb()
    .prepare(
      `INSERT INTO accounts (
        id, display_name, email, protocol, color, signature_html,
        incoming_host, incoming_port, incoming_secure, incoming_username, incoming_password_enc,
        outgoing_host, outgoing_port, outgoing_secure, outgoing_username, outgoing_password_enc,
        auth_type, oauth_provider, oauth_refresh_token_enc, created_at
      ) VALUES (
        @id, @displayName, @email, 'imap', @color, '',
        'imap.gmail.com', 993, 1, @email, @emptyPassword,
        'smtp.gmail.com', 465, 1, @email, @emptyPassword,
        'oauth', 'google', @refreshTokenEnc, @createdAt
      )`
    )
    .run({
      id,
      displayName: name,
      email,
      color,
      emptyPassword,
      refreshTokenEnc: encryptSecret(refreshToken),
      createdAt
    })

  return rowToAccount(getAccountRow(id))
}

export function getGoogleRefreshToken(id: string): string {
  const row = getAccountRow(id)
  if (!row.oauth_refresh_token_enc) {
    throw new Error(`La cuenta ${id} no tiene un refresh token de Google guardado`)
  }
  return decryptSecret(row.oauth_refresh_token_enc)
}
