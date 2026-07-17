import { getGoogleRefreshToken, getIncomingPassword, getOutgoingPassword } from './accountsRepository'
import { refreshGoogleAccessToken } from './googleOAuth'
import type { Account } from '@shared/types'

export interface ResolvedAuth {
  user: string
  pass?: string
  accessToken?: string
}

async function resolveOAuthAuth(account: Account, username: string): Promise<ResolvedAuth> {
  if (account.oauthProvider !== 'google') {
    throw new Error(`Proveedor OAuth no soportado: ${account.oauthProvider}`)
  }
  const refreshToken = getGoogleRefreshToken(account.id)
  const accessToken = await refreshGoogleAccessToken(refreshToken)
  return { user: username, accessToken }
}

export async function resolveImapAuth(account: Account): Promise<ResolvedAuth> {
  if (account.authType === 'oauth') {
    return resolveOAuthAuth(account, account.incoming.username)
  }
  return { user: account.incoming.username, pass: getIncomingPassword(account.id) }
}

export async function resolveSmtpAuth(account: Account): Promise<ResolvedAuth> {
  if (account.authType === 'oauth') {
    return resolveOAuthAuth(account, account.outgoing.username)
  }
  return { user: account.outgoing.username, pass: getOutgoingPassword(account.id) }
}
