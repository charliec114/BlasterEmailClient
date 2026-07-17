<div align="center">

<img src="build/icon.png" width="120" alt="Blaster Email Client" />

# Blaster Email Client

**Tu correo, con la calidez de Apple Mail y el cerebro de un LLM corriendo en tu propia máquina.**

Multi-cuenta · IMAP/POP3 + SMTP · Threading estilo Gmail · IA local con Ollama · Cero servidores de terceros

</div>

---

## ¿Qué es esto?

Blaster es un cliente de email de escritorio (Electron + React + TypeScript) pensado para gente que quiere
la experiencia prolija de Apple Mail, pero sin resignar dos cosas:

1. **Control total de sus cuentas** — cualquier proveedor con IMAP/POP3 y SMTP, sin depender de un backend
   propietario que indexe tus correos en la nube.
2. **Asistencia de IA que no te expone** — la lectura y redacción asistida corre 100% local contra
   [Ollama](https://ollama.com), nunca contra una API externa. Tus correos no salen de tu computadora para
   que un modelo los "entienda".

Nada de esto es una promesa a futuro: **está construido, funcionando y sincronizando correo real hoy.**

## ✨ Funcionalidades

### 📬 Multi-cuenta, cualquier proveedor
- Alta de cuentas por **IMAP o POP3** + **SMTP**, con test de conexión antes de guardar.
- Credenciales cifradas con el keyring del sistema operativo (`safeStorage` de Electron) — nunca en texto plano.
- Firma HTML personalizable por cuenta, con preview en vivo al redactar.

### 🧵 Conversaciones agrupadas como Gmail
- Motor de threading propio: agrupa por `Message-ID`/`In-Reply-To`/`References`, con fallback heurístico por
  asunto normalizado + ventana de tiempo cuando el proveedor no manda esos headers.
- Agrupación **por cuenta completa**, no por carpeta: tu respuesta enviada aparece en el mismo hilo que el
  mensaje original, aunque uno viva en "Recibidos" y el otro en "Enviados".
- Pase de auto-reparación (`rethread`) después de cada sincronización, así los hilos nunca quedan inconsistentes.

### 🤖 IA local, sin nube
- **Resumen de hilo** con un click, generado y cacheado por conversación — se regenera solo cuando detecta
  mensajes nuevos.
- **Redacción asistida**: "Mejorar redacción" y "Sugerir respuesta" sobre el cuerpo del mail, con **undo**
  de un solo botón para volver a tu texto original.
- **Sugerencia de asunto** con IA a partir del cuerpo del mensaje.
- Todo corre contra un servidor Ollama propio, con modelo y estilo de escritura configurables desde Ajustes.

### ✍️ Redacción completa
- Nuevo / Responder / Responder a todos / Reenviar.
- `Cc`/`Bcc` con autocompletado de contactos.
- Adjuntar y visualizar archivos adjuntos (enviados y recibidos).
- Copia automática a "Enviados" vía IMAP APPEND, incluso en servidores que no lo hacen solos.

### 👥 Contactos que se completan solos
- Cada dirección con la que interactuás (enviás o recibís) queda guardada automáticamente.
- Autocompletado al escribir destinatarios, panel de contactos buscable, con opción de eliminar.

### 📖 Lectura segura y prolija
- Render de HTML en iframe **sandboxeado** (sin ejecución de scripts del remitente).
- Colapso automático de texto citado ("Mostrar más"), igual que Gmail/Apple Mail.
- Los links del cuerpo del mail abren en el navegador del sistema, no dentro de la app.
- Marcado de leído automático, carga de imágenes remotas controlada.

### 🎨 Una app, no un compromiso
- Layout de 3 paneles al estilo Apple Mail.
- Tema claro / oscuro / según el sistema.
- Español e inglés, seleccionable desde Ajustes.
- Sonido de notificación configurable.

## 🔐 Filosofía de privacidad

- **Sin servidor propio**: hablás directo con tu proveedor de correo por IMAP/POP3/SMTP.
- **Sin IA en la nube**: la asistencia de escritura y los resúmenes se generan en un Ollama que corre en tu red,
  no en un endpoint de un tercero.
- **Credenciales cifradas en el OS**, nunca en un archivo plano ni en un `.env` versionado.

## 🚧 En el radar

- **Gmail vía OAuth2** — el motor completo (PKCE, refresh de tokens, cuentas OAuth) ya está construido y
  probado, pero en standby hasta conseguir credenciales propias de Google Cloud. Ver
  [`docs/google-oauth-setup.md`](docs/google-oauth-setup.md) para el detalle de qué falta y por qué.

## 🛠️ Stack técnico

| Capa | Tecnología |
|---|---|
| Shell de escritorio | Electron 43 |
| UI | React 19 + TypeScript 7 |
| Bundler | electron-vite / Vite 7 |
| Estado | Zustand |
| Persistencia | SQLite (`better-sqlite3`) |
| Correo | `imapflow`, `node-pop3`, `nodemailer`, `mailparser` |
| IA | Ollama (API HTTP local) |

## 🚀 Cómo correrlo

```bash
npm install       # también recompila better-sqlite3 para el ABI de Electron
npm run dev       # levanta la app en modo desarrollo
```

Otros scripts útiles:

```bash
npm run build       # build de producción (main + preload + renderer)
npm run typecheck   # chequeo de tipos de ambos procesos
npm run package     # empaqueta la app de escritorio con electron-builder
```

Para la asistencia de IA necesitás [Ollama](https://ollama.com) corriendo (local o en tu red) con al menos
un modelo descargado — la URL del servidor y el modelo se configuran desde **Ajustes** dentro de la app.

## 📂 Estructura del proyecto

```
src/
├── main/          # proceso principal: sync IMAP/POP3, SMTP, SQLite, IPC, Ollama
├── preload/       # bridge seguro entre main y renderer (contextBridge)
├── renderer/      # UI en React: sidebar, lista de mensajes, reading pane, compose
└── shared/        # tipos e interfaces IPC compartidos entre procesos
```

---

<div align="center">

Hecho con Electron, React, y la convicción de que un cliente de email puede ser lindo, privado e inteligente
al mismo tiempo.

</div>
