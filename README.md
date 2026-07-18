<div align="center">

<img src="build/icon.png" width="120" alt="Blaster Email Client" />

# Blaster Email Client

**Un cliente de correo de escritorio, prolijo y rápido, con un asistente de IA que responde ante todo a vos.**

Multi-cuenta · IMAP/POP3 + SMTP · OAuth2 con Google · Bandeja unificada · IA local o en la nube, a tu elección

</div>

---

## ¿Qué es esto?

Blaster es un cliente de email de escritorio (Electron + React + TypeScript) pensado para gente que quiere
una experiencia de escritorio nativa, prolija y minimalista, sin resignar dos cosas:

1. **Control total de sus cuentas** — cualquier proveedor con IMAP/POP3 y SMTP, o login directo con Google vía
   OAuth2, sin depender de un backend propietario que indexe tus correos en la nube.
2. **Asistencia de IA a tu criterio** — elegís exactamente qué modelo lee y redacta tus correos: un modelo
   local con [Ollama](https://ollama.com) que nunca manda un byte fuera de tu máquina, o si preferís, tu propia
   API key de OpenAI, Gemini o Anthropic. Un solo proveedor activo a la vez, siempre a la vista cuál es.

Nada de esto es una promesa a futuro: **está construido, funcionando y sincronizando correo real hoy.**

## ✨ Funcionalidades

### 📬 Multi-cuenta, cualquier proveedor
- Alta de cuentas por **IMAP o POP3** + **SMTP**, con test de conexión antes de guardar.
- **Login con Google vía OAuth2** (PKCE, sin pedirle a nadie que consiga sus propias credenciales de API) —
  soporte para más proveedores en camino.
- Credenciales cifradas con el keyring del sistema operativo (`safeStorage` de Electron) — nunca en texto plano.
- Firma HTML personalizable por cuenta, con preview en vivo al redactar.

### 🗂️ Sidebar a tu gusto
- **Bandeja de entrada general** que mezcla los mensajes de todas tus cuentas, ordenados por fecha, con un
  borde de color por fila para saber de qué cuenta viene cada uno.
- Cuentas **colapsables** (mostrás solo el nombre) y **reordenables** por drag & drop, junto con la bandeja
  general, con indicador visual de dónde va a quedar cada una.
- Todo el orden y las preferencias de la sidebar quedan guardados entre sesiones.

### 🧵 Conversaciones agrupadas de forma inteligente
- Motor de threading propio: agrupa por `Message-ID`/`In-Reply-To`/`References`, con fallback heurístico por
  asunto normalizado + ventana de tiempo cuando el proveedor no manda esos headers.
- Agrupación **por cuenta completa**, no por carpeta: tu respuesta enviada aparece en el mismo hilo que el
  mensaje original, aunque uno viva en "Recibidos" y el otro en "Enviados".
- Pase de auto-reparación (`rethread`) después de cada sincronización, así los hilos nunca quedan inconsistentes.

### 🤖 Un solo asistente de IA, elegido por vos
- Cuatro proveedores soportados: **Ollama** (local), **OpenAI**, **Gemini** y **Anthropic** — se activa uno
  solo a la vez, con un indicador explícito en Ajustes de cuál está corriendo y con qué modelo.
- **Resumen de hilo** con un click, generado y cacheado por conversación — se regenera solo cuando detecta
  mensajes nuevos, y el texto se puede seleccionar y copiar.
- **Redacción asistida**: "Mejorar redacción" y "Sugerir respuesta" sobre el cuerpo del mail, con **undo**
  de un solo botón para volver a tu texto original.
- **Sugerencia de asunto** con IA a partir del cuerpo del mensaje.
- Las API keys de los proveedores en la nube se guardan cifradas igual que cualquier contraseña de cuenta,
  nunca en texto plano.

### ✍️ Redacción completa
- Nuevo / Responder / Responder a todos / Reenviar.
- `Cc`/`Bcc` con autocompletado de contactos.
- Adjuntar y visualizar archivos adjuntos (enviados y recibidos).
- Copia automática a "Enviados" vía IMAP APPEND, incluso en servidores que no lo hacen solos.

### 👥 Contactos que se completan solos
- Cada dirección con la que interactuás (enviás o recibís) queda guardada automáticamente.
- Autocompletado al escribir destinatarios, panel de contactos buscable, con opción de **editar** o eliminar
  cualquier contacto.

### 📖 Lectura segura y prolija
- Render de HTML en iframe **sandboxeado** (sin ejecución de scripts del remitente).
- Colapso automático de texto citado ("Mostrar más").
- Los links del cuerpo del mail abren en el navegador del sistema, no dentro de la app.
- Marcado de leído automático, carga de imágenes remotas controlada, scrollbars propios acordes al tema.

### 🎨 Una app, no un compromiso
- Layout clásico de 3 paneles: cuentas, lista de mensajes, lectura.
- Tema claro / oscuro / según el sistema.
- Español e inglés, seleccionable desde Ajustes.
- Sonido de notificación configurable.
- Modales consistentes: siempre se cierran con la cruz, nunca por accidente haciendo click afuera.

## 🔐 Filosofía de privacidad

- **Sin servidor propio**: hablás directo con tu proveedor de correo por IMAP/POP3/SMTP, u OAuth2 directo
  con Google.
- **IA local por default**: con Ollama, la asistencia de escritura y los resúmenes se generan en un servidor
  que corre en tu red, no en un endpoint de un tercero. Los proveedores en la nube son 100% opcionales y quedan
  clarísimos cuando están activos — nunca corren "de fondo" sin que lo hayas elegido explícitamente.
- **Credenciales y API keys cifradas en el OS**, nunca en un archivo plano ni en un `.env` versionado.

## 🚧 En el radar

- Más proveedores de login OAuth2 (el selector ya está preparado para sumarlos).
- Ver [`docs/google-oauth-setup.md`](docs/google-oauth-setup.md) para el detalle de cómo se armó la integración
  con Google, por si hay que repetirlo para otro proyecto o cuenta.

## 🛠️ Stack técnico

| Capa | Tecnología |
|---|---|
| Shell de escritorio | Electron 43 |
| UI | React 19 + TypeScript 7 |
| Bundler | electron-vite / Vite 7 |
| Estado | Zustand |
| Persistencia | SQLite (`better-sqlite3`) |
| Correo | `imapflow`, `node-pop3`, `nodemailer`, `mailparser` |
| IA | Ollama (local) + OpenAI / Gemini / Anthropic (API HTTP, opcional) |

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

Para la asistencia de IA local necesitás [Ollama](https://ollama.com) corriendo (local o en tu red) con al
menos un modelo descargado. Si preferís un proveedor en la nube, alcanza con pegar tu API key en **Ajustes**.
El proveedor activo, servidor/API key y modelo se configuran todo desde ahí.

## 📂 Estructura del proyecto

```
src/
├── main/          # proceso principal: sync IMAP/POP3, SMTP, SQLite, IPC, proveedores de IA
├── preload/       # bridge seguro entre main y renderer (contextBridge)
├── renderer/      # UI en React: sidebar, lista de mensajes, reading pane, compose
└── shared/        # tipos e interfaces IPC compartidos entre procesos
```

---

<div align="center">

Hecho con Electron, React, y la convicción de que un cliente de email puede ser lindo, privado e inteligente
al mismo tiempo.

</div>
