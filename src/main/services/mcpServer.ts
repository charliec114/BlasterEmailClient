import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { randomBytes, timingSafeEqual } from 'crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import type { McpInfo, Thread } from '@shared/types'
import { getApiKey, setApiKey } from './apiKeysRepository'
import { getSetting } from './settingsRepository'
import { listAccounts } from './accountsRepository'
import {
  getAttachmentContent,
  getThreadDetail,
  listFoldersForAccount,
  listThreadsForFolder,
  listUnifiedInboxThreads,
  searchMessages
} from './mailRepository'
import { markFolderRead, markThreadRead, syncAccount } from './syncService'
import { listContacts, searchContacts } from './contactsRepository'
import { getThreadSummary } from './summaryRepository'
import { buildPendingDigest } from './pendingDigest'
import { extractAttachmentText } from './attachmentText'
import { sendMail } from './mailSend'
import { cancelScheduledMail, listScheduledMail, scheduleMail } from './scheduledMailRepository'
import { planReply } from './replyBuilder'
import { notifyMailChanged, openComposeInWindow } from '../windowManager'

const TOKEN_PROVIDER = 'mcp-token'
export const MCP_DEFAULT_PORT = 38417
const MAX_BODY_BYTES = 1024 * 1024
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

let httpServer: Server | null = null
let lastError: string | null = null

function readConfig(): { enabled: boolean; port: number; allowSend: boolean } {
  const port = Number(getSetting('mcpPort'))
  return {
    enabled: getSetting('mcpEnabled') === 'true',
    port: Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : MCP_DEFAULT_PORT,
    allowSend: getSetting('mcpAllowSend') === 'true'
  }
}

export function getMcpToken(): string {
  const existing = getApiKey(TOKEN_PROVIDER)
  if (existing) return existing
  return regenerateMcpToken()
}

export function regenerateMcpToken(): string {
  const token = randomBytes(24).toString('hex')
  setApiKey(TOKEN_PROVIDER, token)
  return token
}

export function getMcpInfo(): McpInfo {
  const config = readConfig()
  return {
    ...config,
    running: httpServer !== null,
    url: `http://127.0.0.1:${config.port}/mcp`,
    token: getMcpToken(),
    error: lastError
  }
}

// ---- Tools ---------------------------------------------------------------------------

function text(value: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] }
}

function fail(message: string): { content: { type: 'text'; text: string }[]; isError: true } {
  return { content: [{ type: 'text', text: message }], isError: true }
}

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
}

// Versión liviana de un hilo para listados: sin cuerpos, para no inundar el contexto del modelo.
function threadSummaryRow(thread: Thread): Record<string, unknown> {
  return {
    threadId: thread.id,
    accountId: thread.accountId,
    folderId: thread.folderId,
    subject: thread.subject,
    participants: thread.participants.map((p) => (p.name && p.name !== p.email ? `${p.name} <${p.email}>` : p.email)),
    messageCount: thread.messages.length,
    snippet: thread.snippet,
    lastMessageDate: thread.lastMessageDate,
    hasUnread: thread.hasUnread,
    isFlagged: thread.isFlagged
  }
}

function page(threads: Thread[], limit: number | undefined, offset: number | undefined): Record<string, unknown> {
  const start = offset ?? 0
  const size = clampLimit(limit)
  return {
    total: threads.length,
    offset: start,
    threads: threads.slice(start, start + size).map(threadSummaryRow)
  }
}

const addressList = z.array(z.string().email()).describe('Direcciones de email')

const sendFields = {
  accountId: z.string().describe('ID de la cuenta desde la que se envía (ver list_accounts)'),
  to: addressList.min(1),
  cc: addressList.default([]),
  bcc: addressList.default([]),
  subject: z.string(),
  bodyText: z.string().describe('Cuerpo en texto plano (la firma de la cuenta se agrega sola)'),
  inReplyTo: z.string().optional().describe('messageId del mensaje al que se responde, para mantener el hilo'),
  references: z.array(z.string()).optional()
}

function buildServer(allowSend: boolean): McpServer {
  const server = new McpServer({ name: 'blaster-email-client', version: '1.0.0' })

  server.registerTool(
    'list_accounts',
    { description: 'Lista las cuentas de correo configuradas en Blaster.', inputSchema: {} },
    async () =>
      text(
        listAccounts().map((a) => ({
          id: a.id,
          label: a.label,
          displayName: a.displayName,
          email: a.email,
          protocol: a.protocol
        }))
      )
  )

  server.registerTool(
    'list_folders',
    {
      description: 'Lista las carpetas de una cuenta con su tipo y cantidad de no leídos.',
      inputSchema: { accountId: z.string() }
    },
    async ({ accountId }) => text(listFoldersForAccount(accountId))
  )

  server.registerTool(
    'list_threads',
    {
      description:
        'Lista hilos (conversaciones) sin cuerpos, del más reciente al más viejo. Sin accountId devuelve la bandeja de entrada unificada de todas las cuentas. Con accountId y folderId, esa carpeta.',
      inputSchema: {
        accountId: z.string().optional(),
        folderId: z.string().optional().describe('Requiere accountId'),
        unreadOnly: z.boolean().optional(),
        limit: z.number().int().optional().describe(`Máximo ${MAX_LIMIT}, por defecto ${DEFAULT_LIMIT}`),
        offset: z.number().int().min(0).optional()
      }
    },
    async ({ accountId, folderId, unreadOnly, limit, offset }) => {
      if (folderId && !accountId) return fail('folderId requiere accountId')
      let threads = accountId && folderId ? listThreadsForFolder(accountId, folderId) : listUnifiedInboxThreads()
      if (accountId && !folderId) threads = threads.filter((t) => t.accountId === accountId)
      if (unreadOnly) threads = threads.filter((t) => t.hasUnread)
      return text(page(threads, limit, offset))
    }
  )

  server.registerTool(
    'search_threads',
    {
      description:
        'Búsqueda de texto completo (asunto, remitente, destinatarios y cuerpo) en todas las cuentas. Cada término se busca como prefijo.',
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().optional(),
        offset: z.number().int().min(0).optional()
      }
    },
    async ({ query, limit, offset }) => text(page(searchMessages(query), limit, offset))
  )

  server.registerTool(
    'get_thread',
    {
      description:
        'Devuelve un hilo completo con el texto de todos sus mensajes y la lista de adjuntos (usar get_attachment_text para leerlos).',
      inputSchema: {
        accountId: z.string(),
        threadId: z.string(),
        maxCharsPerMessage: z.number().int().min(200).optional().describe('Recorta cada cuerpo (por defecto 8000)')
      }
    },
    async ({ accountId, threadId, maxCharsPerMessage }) => {
      const thread = getThreadDetail(accountId, threadId)
      if (!thread) return fail('Hilo no encontrado')
      const max = maxCharsPerMessage ?? 8000
      return text({
        ...threadSummaryRow(thread),
        messages: thread.messages.map((m) => ({
          id: m.id,
          messageId: m.messageId,
          from: m.from,
          to: m.to,
          cc: m.cc,
          date: m.date,
          subject: m.subject,
          isRead: m.isRead,
          body: m.bodyText.length > max ? `${m.bodyText.slice(0, max)}\n[...recortado]` : m.bodyText,
          attachments: m.attachments
        }))
      })
    }
  )

  server.registerTool(
    'get_attachment_text',
    {
      description: 'Extrae el texto de un adjunto (PDF y texto plano). Otros formatos no tienen extractor.',
      inputSchema: { attachmentId: z.string() }
    },
    async ({ attachmentId }) => {
      const attachment = getAttachmentContent(attachmentId)
      if (!attachment) return fail('Adjunto no encontrado')
      const extracted = await extractAttachmentText(attachment.filename, attachment.contentType, attachment.content)
      return extracted ? text(extracted) : fail(`No hay extractor de texto para "${attachment.filename}"`)
    }
  )

  server.registerTool(
    'get_thread_summary',
    {
      description: 'Devuelve el resumen de IA ya cacheado de un hilo, si existe (no genera uno nuevo).',
      inputSchema: { threadId: z.string() }
    },
    async ({ threadId }) => text(getThreadSummary(threadId) ?? 'Este hilo no tiene resumen guardado.')
  )

  server.registerTool(
    'get_mail_digest',
    {
      description:
        'Junta el texto de todos los hilos con actividad en un rango de fechas (con texto de adjuntos), listo para analizar: pendientes, pedidos, etc. Tope de tamaño total; los hilos más viejos se descartan primero.',
      inputSchema: {
        fromDate: z.string().describe('ISO 8601, ej. 2026-10-01T00:00:00.000Z'),
        toDate: z.string().describe('ISO 8601'),
        accountIds: z.array(z.string()).default([]).describe('Vacío = todas las cuentas')
      }
    },
    async ({ fromDate, toDate, accountIds }) => {
      const digest = await buildPendingDigest({ accountIds, fromDate, toDate })
      if (!digest.text) return text('No hay correos en ese rango.')
      return text(
        `${digest.threadCount} hilos, ${digest.messageCount} mensajes${digest.truncated ? ' (truncado por tamaño)' : ''}\n\n${digest.text}`
      )
    }
  )

  server.registerTool(
    'list_contacts',
    {
      description: 'Contactos guardados (con quienes se intercambió correo). Con query, busca por nombre o email.',
      inputSchema: { query: z.string().optional() }
    },
    async ({ query }) => text(query?.trim() ? searchContacts(query, 25) : listContacts().slice(0, 100))
  )

  server.registerTool(
    'sync_mail',
    {
      description: 'Busca correo nuevo en el servidor. Sin accountId sincroniza todas las cuentas.',
      inputSchema: { accountId: z.string().optional() }
    },
    async ({ accountId }) => {
      const ids = accountId ? [accountId] : listAccounts().map((a) => a.id)
      const results: Record<string, number | string> = {}
      for (const id of ids) {
        try {
          results[id] = await syncAccount(id)
        } catch (error) {
          results[id] = `error: ${error instanceof Error ? error.message : String(error)}`
        }
      }
      notifyMailChanged()
      return text({ newMessagesByAccount: results })
    }
  )

  server.registerTool(
    'mark_thread_read',
    {
      description: 'Marca como leído un hilo (también en el servidor IMAP). folderId sale de list_threads.',
      inputSchema: { accountId: z.string(), folderId: z.string(), threadId: z.string() }
    },
    async ({ accountId, folderId, threadId }) => {
      await markThreadRead(accountId, folderId, threadId)
      notifyMailChanged()
      return text('Hilo marcado como leído.')
    }
  )

  server.registerTool(
    'mark_folder_read',
    {
      description: 'Marca como leída una carpeta entera (también en el servidor IMAP).',
      inputSchema: { accountId: z.string(), folderId: z.string() }
    },
    async ({ accountId, folderId }) => {
      await markFolderRead(accountId, folderId)
      notifyMailChanged()
      return text('Carpeta marcada como leída.')
    }
  )

  server.registerTool(
    'draft_reply',
    {
      description:
        'Abre el redactor de Blaster con la respuesta a un hilo ya cargada (destinatarios, asunto "Re:", hilo y texto citado) para que el usuario la revise, edite y envíe él. No envía nada. Preferir esto a reply_to_thread salvo que el usuario pida enviar directo.',
      inputSchema: {
        accountId: z.string(),
        threadId: z.string(),
        bodyText: z.string().describe('Texto de la respuesta (sin el citado, se agrega solo)'),
        replyAll: z.boolean().default(false)
      }
    },
    async ({ accountId, threadId, bodyText, replyAll }) => {
      const plan = planReply(accountId, threadId, replyAll)
      openComposeInWindow({
        accountId,
        to: plan.to.join(', '),
        cc: plan.cc.length ? plan.cc.join(', ') : undefined,
        subject: plan.subject,
        body: `${bodyText}\n\n${plan.quotedText}`,
        inReplyTo: plan.inReplyTo,
        references: plan.references,
        context: plan.context
      })
      return text(`Borrador abierto en Blaster para ${plan.to.join(', ')}${plan.cc.length ? ` (cc: ${plan.cc.join(', ')})` : ''}. El usuario tiene que revisarlo y enviarlo (si ya tenía un redactor abierto, no se reemplaza: que lo cierre y reintentá).`)
    }
  )

  server.registerTool(
    'list_scheduled_mail',
    { description: 'Lista los envíos programados y su estado.', inputSchema: {} },
    async () =>
      text(
        listScheduledMail().map((s) => ({
          id: s.id,
          accountId: s.accountId,
          to: s.to,
          subject: s.subject,
          scheduledFor: s.scheduledFor,
          status: s.status,
          error: s.error
        }))
      )
  )

  if (allowSend) {
    server.registerTool(
      'send_mail',
      {
        description:
          'ENVÍA un correo de inmediato desde una cuenta del usuario. Acción irreversible: confirmar destinatarios y contenido con el usuario antes de llamarla.',
        inputSchema: sendFields
      },
      async (input) => {
        await sendMail({ ...input, attachments: [] })
        notifyMailChanged()
        return text(`Correo enviado a ${input.to.join(', ')}.`)
      }
    )

    server.registerTool(
      'reply_to_thread',
      {
        description:
          'ENVÍA de inmediato una respuesta a un hilo (destinatarios, asunto "Re:", encadenado y texto citado se resuelven solos). Acción irreversible: mostrar al usuario el texto y los destinatarios (ver draft_reply) y confirmar antes de llamarla.',
        inputSchema: {
          accountId: z.string(),
          threadId: z.string(),
          bodyText: z.string().describe('Texto de la respuesta (el citado y la firma se agregan solos)'),
          replyAll: z.boolean().default(false)
        }
      },
      async ({ accountId, threadId, bodyText, replyAll }) => {
        const plan = planReply(accountId, threadId, replyAll)
        await sendMail({
          accountId,
          to: plan.to,
          cc: plan.cc,
          bcc: [],
          subject: plan.subject,
          bodyText: `${bodyText}\n\n${plan.quotedText}`,
          inReplyTo: plan.inReplyTo,
          references: plan.references,
          attachments: []
        })
        notifyMailChanged()
        return text(`Respuesta enviada a ${plan.to.join(', ')}${plan.cc.length ? ` (cc: ${plan.cc.join(', ')})` : ''}.`)
      }
    )

    server.registerTool(
      'schedule_mail',
      {
        description:
          'Programa un correo para enviarse más tarde (mientras Blaster esté abierto). Se puede cancelar con cancel_scheduled_mail.',
        inputSchema: { ...sendFields, scheduledFor: z.string().describe('Fecha/hora ISO 8601 futura') }
      },
      async (input) => {
        if (Number.isNaN(Date.parse(input.scheduledFor))) return fail('scheduledFor no es una fecha válida')
        const scheduled = scheduleMail({ ...input, attachments: [] })
        notifyMailChanged()
        return text({ id: scheduled.id, scheduledFor: scheduled.scheduledFor, status: scheduled.status })
      }
    )

    server.registerTool(
      'cancel_scheduled_mail',
      { description: 'Cancela un envío programado pendiente.', inputSchema: { id: z.string() } },
      async ({ id }) => {
        cancelScheduledMail(id)
        notifyMailChanged()
        return text('Envío programado cancelado.')
      }
    )
  }

  return server
}

// ---- HTTP ----------------------------------------------------------------------------

function tokenMatches(header: string | undefined, expected: string): boolean {
  const provided = Buffer.from((header ?? '').replace(/^Bearer\s+/i, ''))
  const wanted = Buffer.from(expected)
  return provided.length === wanted.length && timingSafeEqual(provided, wanted)
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body demasiado grande'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : undefined)
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, token: string): Promise<void> {
  // Defensa contra DNS rebinding: sólo se atiende si el Host es loopback. Un sitio web
  // malicioso no puede mandar un Host distinto aunque resuelva su dominio a 127.0.0.1.
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(req.headers.host ?? '')) {
    return sendJson(res, 403, { error: 'Host no permitido' })
  }
  if (req.url?.split('?')[0] !== '/mcp') return sendJson(res, 404, { error: 'No encontrado' })
  if (!tokenMatches(req.headers.authorization, token)) return sendJson(res, 401, { error: 'Token inválido' })
  if (req.method !== 'POST') {
    // Modo stateless: no hay sesiones ni stream SSE de servidor.
    return sendJson(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'Método no permitido' }, id: null })
  }

  let body: unknown
  try {
    body = await readBody(req)
  } catch {
    return sendJson(res, 400, { jsonrpc: '2.0', error: { code: -32700, message: 'JSON inválido' }, id: null })
  }

  const server = buildServer(readConfig().allowSend)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  res.on('close', () => {
    transport.close()
    server.close()
  })
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, body)
  } catch (error) {
    console.error('Error atendiendo pedido MCP:', error)
    if (!res.headersSent) sendJson(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Error interno' }, id: null })
  }
}

export function stopMcpServer(): Promise<void> {
  const current = httpServer
  httpServer = null
  if (!current) return Promise.resolve()
  return new Promise((resolve) => {
    current.close(() => resolve())
    current.closeAllConnections()
  })
}

// Arranca (o reinicia) el servidor según los ajustes guardados. Escucha sólo en loopback.
export async function applyMcpConfig(): Promise<McpInfo> {
  await stopMcpServer()
  lastError = null
  const config = readConfig()

  if (config.enabled) {
    const token = getMcpToken()
    const candidate = createServer((req, res) => {
      handleRequest(req, res, token).catch((error) => {
        console.error('Error en el servidor MCP:', error)
        if (!res.headersSent) sendJson(res, 500, { error: 'Error interno' })
      })
    })
    try {
      await new Promise<void>((resolve, reject) => {
        candidate.once('error', reject)
        candidate.listen(config.port, '127.0.0.1', () => {
          candidate.off('error', reject)
          resolve()
        })
      })
      httpServer = candidate
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  return getMcpInfo()
}
