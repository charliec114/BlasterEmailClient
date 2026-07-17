import { randomBytes, createHash } from 'crypto'
import http from 'http'
import type { AddressInfo } from 'net'
import { shell } from 'electron'
import { getAllSettings } from './settingsRepository'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
const GMAIL_SCOPE = 'https://mail.google.com/ https://www.googleapis.com/auth/userinfo.email'
const AUTH_TIMEOUT_MS = 3 * 60 * 1000

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function getGoogleCredentials(): { clientId: string; clientSecret: string } {
  const settings = getAllSettings()
  if (!settings.googleClientId || !settings.googleClientSecret) {
    throw new Error(
      'Configurá el Client ID y Client Secret de Google en Ajustes antes de conectar una cuenta de Gmail.'
    )
  }
  return { clientId: settings.googleClientId, clientSecret: settings.googleClientSecret }
}

function waitForAuthCode(server: http.Server): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Se agotó el tiempo de espera para completar el login con Google.'))
    }, AUTH_TIMEOUT_MS)

    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const code = url.searchParams.get('code')
      const errorParam = url.searchParams.get('error')

      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      if (code) {
        res.end('<html><body><h2>Listo. Ya podés cerrar esta pestaña y volver a Blaster Email Client.</h2></body></html>')
        clearTimeout(timeout)
        resolve(code)
      } else {
        res.end('<html><body><h2>Ocurrió un error al conectar con Google.</h2></body></html>')
        clearTimeout(timeout)
        reject(new Error(errorParam || 'No se recibió el código de autorización'))
      }
    })
  })
}

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

export interface GoogleAccountInfo {
  email: string
  name: string
  refreshToken: string
}

export async function connectGoogleAccount(): Promise<GoogleAccountInfo> {
  const { clientId, clientSecret } = getGoogleCredentials()

  const codeVerifier = base64url(randomBytes(32))
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest())

  const server = http.createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  const redirectUri = `http://127.0.0.1:${port}`

  const authUrl = new URL(GOOGLE_AUTH_URL)
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', GMAIL_SCOPE)
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  const codePromise = waitForAuthCode(server)

  let code: string
  try {
    await shell.openExternal(authUrl.toString())
    code = await codePromise
  } finally {
    server.close()
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier
    })
  })
  if (!tokenRes.ok) {
    throw new Error(`Google respondió ${tokenRes.status} al intercambiar el código de autorización`)
  }
  const tokens = (await tokenRes.json()) as GoogleTokenResponse
  if (!tokens.refresh_token) {
    throw new Error(
      'Google no devolvió un refresh token. Revocá el acceso previo en myaccount.google.com/permissions y probá de nuevo.'
    )
  }

  const userInfoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  })
  if (!userInfoRes.ok) {
    throw new Error('No se pudo obtener el email de la cuenta de Google')
  }
  const userInfo = (await userInfoRes.json()) as { email: string; name?: string }

  return { email: userInfo.email, name: userInfo.name || userInfo.email, refreshToken: tokens.refresh_token }
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = getGoogleCredentials()

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })
  if (!res.ok) {
    throw new Error(`No se pudo refrescar el token de Google (${res.status})`)
  }
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}
