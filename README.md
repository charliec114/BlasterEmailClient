<div align="center">

<img src="build/icon.png" width="120" alt="Blaster Email Client" />

# Blaster Email Client

**Un cliente de correo de escritorio, prolijo y rápido, con un asistente de IA que responde ante todo a vos.**

Multi-cuenta · IMAP/POP3 + SMTP · OAuth2 con Google · Bandeja unificada · IA con cualquier API compatible con OpenAI (Ollama, OpenRouter, OpenAI…)

</div>

---

## ¿Qué es esto?

Blaster es un cliente de email de escritorio (Electron + React + TypeScript) pensado para gente que quiere
una experiencia de escritorio nativa, prolija y minimalista, sin resignar dos cosas:

1. **Control total de sus cuentas** — cualquier proveedor con IMAP/POP3 y SMTP, o login directo con Google vía
   OAuth2, sin depender de un backend propietario que indexe tus correos en la nube.
2. **Asistencia de IA a tu criterio** — vos elegís qué modelo lee y redacta tus correos, con una sola
   configuración (URL, modelo y token opcional) que sirve para cualquier API compatible con OpenAI: un modelo
   local con [Ollama](https://ollama.com) que nunca manda un byte fuera de tu máquina, o un servicio como
   OpenRouter, OpenAI, Gemini o Anthropic si preferís la nube.

## ✨ Funcionalidades

### 📬 Multi-cuenta, cualquier proveedor
- Alta de cuentas por **IMAP o POP3** + **SMTP**, con test de conexión antes de guardar.
- **Login con Google vía OAuth2** (PKCE, sin pedirle a nadie que consiga sus propias credenciales de API).
- Cada cuenta tiene un **nombre para mostrar** (etiqueta) separado del nombre de remitente.
- Credenciales cifradas con el keyring del sistema operativo (`safeStorage` de Electron) — nunca en texto plano.
- Firma HTML personalizable por cuenta, con preview en vivo al redactar.

### 🔄 Sincronización
- Sincronización automática cada 5 minutos, más un botón para **buscar novedades en todas las cuentas** y otro
  **por cuenta** (el 🔄 al lado del nombre de cada una), para cuando esperás un correo puntual.
- Sincronización incremental: solo baja lo nuevo, y si no llegó nada no se vuelve a armar ninguna lista.
- Aviso de correo nuevo con notificación del sistema (remitente y cuenta) y sonido, ambos opcionales.
- Búsqueda de texto completo sobre asunto, remitente, destinatarios y cuerpo, con SQLite FTS5 (por palabra o
  prefijo, se actualiza mientras escribís).

### 🗂️ Sidebar a tu gusto
- **Bandeja general** que mezcla los mensajes de todas tus cuentas, ordenados por fecha, con un borde de color
  por fila para saber de qué cuenta viene cada uno.
- Cuentas **colapsables** y **reordenables** por drag & drop, junto con la bandeja general.
- Menú contextual sobre una carpeta para **marcarla como leída**, y contadores de no leídos.
- Todo el orden y las preferencias de la sidebar quedan guardados entre sesiones.

### 🧵 Conversaciones agrupadas de forma inteligente
- Motor de threading propio: agrupa por `Message-ID`/`In-Reply-To`/`References`, con fallback por asunto
  normalizado + ventana de tiempo, y solo para respuestas/reenvíos reales (`Re:`/`Fwd:`), así dos correos
  distintos con el mismo asunto no se funden.
- Agrupación **por cuenta completa**, no por carpeta: tu respuesta enviada aparece en el mismo hilo que el
  mensaje original, aunque uno viva en "Recibidos" y el otro en "Enviados".
- Auto-reparación de hilos tras cada sincronización con mail nuevo (acotada a los últimos 90 días, con un
  barrido completo único por cuenta) para que nunca queden inconsistentes sin frenar la app.

### 🤖 Asistente de IA con la API que quieras
- **Una sola configuración compatible con OpenAI** en Ajustes: URL de la API, modelo y token (opcional en
  servidores locales). Funciona con **Ollama**, LM Studio, vLLM, llama.cpp, **OpenRouter**, OpenAI, Google
  Gemini y Anthropic (vía sus endpoints de compatibilidad), Groq y cualquier otro; un ⓘ junto a la URL lista
  ejemplos listos para copiar.
- El campo de modelo consulta `/models` del servidor y ofrece un selector con todos los modelos disponibles
  (o escribís el nombre a mano).
- **Resumen de hilo** con un click, generado y cacheado por conversación; avisa cuando quedó desactualizado.
- **Redacción asistida**: "Mejorar redacción" y "Sugerir respuesta" sobre el cuerpo del mail, con **undo**
  de un solo botón para volver a tu texto original, y **sugerencia de asunto**.
- **Estilo de redacción** configurable: un prompt propio que se aplica a todo lo que escribe la IA.
- **Asistente de pendientes**: un chat para preguntarle a tus correos ("¿qué me queda pendiente?", "¿qué me
  pidieron?"), filtrando por cuentas y rango de fechas, con conversaciones guardadas. Lee también el texto de
  adjuntos PDF y de texto plano, y enlaza a los hilos que usó como fuente.
- El token se guarda cifrado igual que cualquier contraseña de cuenta.

### ✍️ Redacción completa
- Nuevo / Responder / Responder a todos / Reenviar.
- **Editor de texto enriquecido**: negrita, cursiva, subrayado, listas, links y limpiar formato.
- `Cc`/`Bcc` con autocompletado de contactos.
- Adjuntar y visualizar archivos adjuntos (enviados y recibidos).
- Copia automática a "Enviados" vía IMAP APPEND, incluso en servidores que no lo hacen solos.

### 🕒 Envío programado
- Elegí cuándo se envía un correo: mañana a las 8 o a las 13, el próximo lunes, o fecha y hora a medida.
- Panel de **Programados** para ver lo pendiente, enviarlo ahora o cancelarlo, con el estado (enviado / falló).
- Los envíos se procesan mientras la app está abierta.

### 👥 Contactos que se completan solos
- Cada dirección con la que interactuás (enviás o recibís) queda guardada automáticamente.
- Autocompletado al escribir destinatarios y panel de contactos buscable, para **editar** o eliminar.

### 📖 Lectura segura y prolija
- Render de HTML en iframe **sandboxeado** (sin ejecución de scripts del remitente).
- Colapso automático de texto citado ("Mostrar texto completo").
- Los links del cuerpo abren en el navegador del sistema, no dentro de la app.
- Marcado de leído automático (también en el servidor IMAP) y adjuntos guardables con un click.

### ⚡ Pensado para quedar abierto todo el día
- Base local en SQLite con índices cubrientes: armar una bandeja de miles de hilos toma milisegundos.
- La **lista de mensajes está virtualizada**: solo se dibujan las filas visibles, sin importar cuántos hilos haya.
- Las listas no cargan el cuerpo de los mensajes; el detalle completo se pide solo para el hilo abierto.
- Sin trabajo de fondo innecesario: no se refresca nada si el sync no trajo correo nuevo.

### 🎨 Una app, no un compromiso
- Layout clásico de 3 paneles: cuentas, lista de mensajes, lectura.
- Tema claro / oscuro / según el sistema.
- Español e inglés, seleccionable desde Ajustes.
- Chequeo de actualizaciones desde "Acerca de", con link a la última versión publicada.
- Modales consistentes: siempre se cierran con la cruz, nunca por accidente haciendo click afuera.

## 🔐 Filosofía de privacidad

- **Sin servidor propio**: hablás directo con tu proveedor de correo por IMAP/POP3/SMTP, u OAuth2 directo
  con Google. Todo tu correo vive en una base SQLite en tu máquina.
- **IA por elección explícita**: la app no trae ningún proveedor preconfigurado. Si apuntás la URL a un Ollama
  en tu red, los resúmenes y la redacción se generan sin salir de ahí; si elegís un servicio en la nube, el
  contenido que le pasás a la IA (el hilo, tu borrador) viaja a ese servicio. Sin URL y modelo configurados, no
  se hace ningún pedido a ninguna IA.
- **Credenciales y tokens cifrados en el OS**, nunca en un archivo plano ni en un `.env` versionado.

## 🛠️ Stack técnico

| Capa | Tecnología |
|---|---|
| Shell de escritorio | Electron 43 |
| UI | React 19 + TypeScript 7 |
| Bundler | electron-vite / Vite 7 |
| Estado | Zustand |
| Persistencia | SQLite (`better-sqlite3`) con FTS5 |
| Correo | `imapflow`, `node-pop3`, `nodemailer`, `mailparser` |
| Adjuntos | `pdf-parse` (texto de PDFs para el asistente) |
| IA | Cualquier API compatible con OpenAI (`/chat/completions` y `/models`) |

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

### Login con Google (opcional)

El botón "Conectar cuenta de Google" necesita las credenciales de un OAuth Client ID (tipo "Desktop app"). Se
inyectan al compilar desde variables de entorno: copiá `.env.example` a `.env` y completá `GOOGLE_CLIENT_ID` y
`GOOGLE_CLIENT_SECRET`. Sin eso la app funciona igual con IMAP/POP3 manual. El paso a paso está en
[`docs/google-oauth-setup.md`](docs/google-oauth-setup.md).

### Configurar la IA

En **Ajustes → Asistente de IA** completá la URL de la API, el modelo y, si el servicio lo pide, el token.
Ejemplos de URL (incluí siempre la versión, `/v1`):

| Servicio | URL | Token |
|---|---|---|
| Ollama (local o en tu red) | `http://localhost:11434/v1` | no hace falta |
| LM Studio | `http://localhost:1234/v1` | no hace falta |
| OpenRouter | `https://openrouter.ai/api/v1` | sí |
| OpenAI | `https://api.openai.com/v1` | sí |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | sí |
| Anthropic | `https://api.anthropic.com/v1` | sí |

> Si usás Ollama en otra máquina de tu red, tiene que escuchar fuera de `localhost` (variable de entorno
> `OLLAMA_HOST=0.0.0.0`).

## 📦 Releases

Las versiones se publican con un tag `vX.Y.Z`: el workflow de GitHub Actions
([`.github/workflows/release.yml`](.github/workflows/release.yml)) compila para Linux (`.deb`), Windows
(instalador NSIS) y macOS (`.dmg`) y los adjunta a la release. La app avisa desde **Acerca de** cuando hay una
versión más nueva.

## 📂 Estructura del proyecto

```
src/
├── main/          # proceso principal: sync IMAP/POP3, SMTP, SQLite, IPC, cliente de IA, envíos programados
├── preload/       # bridge seguro entre main y renderer (contextBridge)
├── renderer/      # UI en React: sidebar, lista de mensajes, reading pane, compose, asistente
└── shared/        # tipos e interfaces IPC compartidos entre procesos
docs/              # guías (integración con Google OAuth)
```

---

<div align="center">

Hecho con Electron, React, y la convicción de que un cliente de email puede ser lindo, privado e inteligente
al mismo tiempo.

</div>
