# Integración con Gmail (OAuth2)

**Estado: activa.** El proyecto de Google Cloud (`blaster-email-client`, cuenta
`charliec114@gmail.com`) ya está creado, y el botón "Conectar cuenta de Google" ya
está disponible dentro de "Agregar cuenta".

⚠️ La app sigue en modo **Testing** en la pantalla de consentimiento de Google — el
refresh token puede expirar cada 7 días y va a pedir volver a loguearse. Solo las
cuentas agregadas como "Test user" en el proyecto pueden conectarse (hoy:
`charliec114@gmail.com`). Para agregar más cuentas de prueba, o para sacar la app de
Testing (requiere el proceso de verificación de Google), hay que volver a
console.cloud.google.com → OAuth consent screen.

## Manejo del Client ID/Secret (repo público)

El repo es público, así que el Client ID/Secret **no vive como texto en ningún
archivo versionado**. Se inyectan como variables de entorno en el momento del build
(`electron.vite.config.ts` los reemplaza como literales en el bundle final del
proceso main vía `define`):

- **Desarrollo local**: copiá `.env.example` a `.env` (que está en `.gitignore`) y
  completá `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` ahí. Sin ese archivo, la app
  funciona igual con IMAP/POP3 manual — solo el login con Google queda deshabilitado.
- **Releases (CI)**: `.github/workflows/release.yml` los toma de GitHub Actions
  Secrets (`Settings → Secrets and variables → Actions` del repo), nunca del código.

Si el secret se filtra alguna vez (nos pasó una vez con GitGuardian), rotarlo en
Cloud Console y actualizar el `.env` local + los secrets de GitHub Actions alcanza —
no hace falta reescribir el historial de git, porque una vez expuesto lo único que
realmente arregla algo es invalidar la credencial vieja.

Lo que sigue debajo queda como referencia de cómo se armó, por si hay que repetirlo
para otro proyecto o cuenta de Google.

## 1. Crear el proyecto en Google Cloud Console

1. Ir a [console.cloud.google.com](https://console.cloud.google.com).
2. Crear un proyecto nuevo (o reutilizar uno existente).

## 2. Configurar la pantalla de consentimiento OAuth

1. "APIs & Services" → "OAuth consent screen".
2. Tipo de usuario: **External**.
3. Completar nombre de la app y tu email de contacto.
4. En "Scopes", agregar: `https://mail.google.com/` (acceso completo a IMAP/SMTP).
5. En "Test users", agregarte a vos mismo (tu cuenta de Gmail). Mientras la app quede en
   modo **Testing** (que es lo normal para uso personal, sin pasar por la verificación
   de Google), solo las cuentas listadas ahí van a poder loguearse.

⚠️ **Importante**: en modo Testing, el *refresh token* puede expirar cada 7 días,
obligando a volver a loguearse. Sacar la app de Testing con este scope requeriría el
proceso de verificación de Google (CASA security assessment), que es demasiado para
un uso personal. Por ahora lo aceptamos como limitación conocida.

## 3. Crear las credenciales OAuth

1. "APIs & Services" → "Credentials" → "Create Credentials" → "OAuth client ID".
2. Tipo de aplicación: **Desktop app**.
3. Anotar el **Client ID** y el **Client Secret** que se generan.

## 4. Pasarme esas credenciales

Una vez que tengas Client ID y Client Secret, me los pasás y los cargo en `.env`
(desarrollo local) y en los Secrets de GitHub Actions (releases) — **no** van a ir
en un campo de Ajustes, eso es config interna de la app, no algo que el usuario
final tenga que resolver. Ver la sección de arriba para el detalle de dónde vive
cada uno.

## 5. Lo que hago yo después

- Cargo las credenciales en `.env` local y en los Secrets de GitHub Actions.
- Confirmo que el botón "Conectar cuenta de Google" esté disponible en el Sidebar.
- Probamos el flujo de punta a punta: click → navegador → login → cuenta creada.

## Referencia rápida del código ya construido

- `src/main/services/googleOAuth.ts` — flujo de login (PKCE + servidor loopback) y
  refresco de access token.
- `src/main/services/authResolver.ts` — decide si una cuenta usa password u OAuth.
- `src/main/services/accountsRepository.ts` — `addGoogleAccount`, `getGoogleRefreshToken`.
- Columnas en la tabla `accounts`: `auth_type`, `oauth_provider`, `oauth_refresh_token_enc`.
