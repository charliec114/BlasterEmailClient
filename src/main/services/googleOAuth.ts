import { randomBytes, createHash } from 'crypto'
import http from 'http'
import type { AddressInfo } from 'net'
import { shell } from 'electron'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
const GMAIL_SCOPE = 'https://mail.google.com/ https://www.googleapis.com/auth/userinfo.email'
const AUTH_TIMEOUT_MS = 3 * 60 * 1000

// Client ID/Secret del proyecto "blaster-email-client" en Google Cloud Console, tipo
// "Desktop app" — Google no considera confidencial el secreto de este tipo de cliente
// (usa PKCE como capa de seguridad real), así que no hace falta pedírselo a cada usuario
// final. Pero como el repo es público, el VALOR no vive en este archivo: se inyecta en
// tiempo de build desde variables de entorno (.env local o secrets de CI), ver
// electron.vite.config.ts y docs/google-oauth-setup.md.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? ''

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function callbackPage(opts: { ok: boolean; title: string; detail: string }): string {
  const icon = opts.ok
    ? `<svg width="52" height="52" viewBox="0 0 52 52" fill="none"><circle cx="26" cy="26" r="25" fill="#30d158" fill-opacity="0.15" stroke="#30d158" stroke-width="2"/><path d="M16 27l7 7 13-15" stroke="#30d158" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`
    : `<svg width="52" height="52" viewBox="0 0 52 52" fill="none"><circle cx="26" cy="26" r="25" fill="#ff375f" fill-opacity="0.15" stroke="#ff375f" stroke-width="2"/><path d="M18 18l16 16M34 18L18 34" stroke="#ff375f" stroke-width="3" stroke-linecap="round"/></svg>`

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Blaster Email Client</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f5f5f7; color: #1d1d1f;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #1e1e20; color: #f5f5f7; }
    .card { background: #262628 !important; border-color: #3a3a3c !important; }
    .detail { color: #9a9a9e !important; }
  }
  .card {
    background: #ffffff; border: 1px solid #dcdcde; border-radius: 16px;
    padding: 36px 40px; max-width: 380px; text-align: center;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
  }
  .icon { margin-bottom: 16px; }
  h1 { font-size: 17px; margin: 0 0 8px; }
  .detail { font-size: 13px; color: #6e6e73; line-height: 1.5; margin: 0; }
  .brand { margin-top: 22px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #0a84ff; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${opts.title}</h1>
    <p class="detail">${opts.detail}</p>
    <div class="brand">Blaster Email Client</div>
  </div>
</body>
</html>`
}

function getGoogleCredentials(): { clientId: string; clientSecret: string } {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error(
      'Esta build no tiene configuradas las credenciales de Google (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET). Ver docs/google-oauth-setup.md.'
    )
  }
  return { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET }
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
        res.end(
          callbackPage({
            ok: true,
            title: 'Cuenta conectada',
            detail: 'Ya podés cerrar esta pestaña y volver a Blaster Email Client.'
          })
        )
        clearTimeout(timeout)
        resolve(code)
      } else {
        res.end(
          callbackPage({
            ok: false,
            title: 'No se pudo conectar la cuenta',
            detail: 'Ocurrió un error al conectar con Google. Podés cerrar esta pestaña y volver a intentarlo desde la app.'
          })
        )
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
