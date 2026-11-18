import type { ScheduledMail } from '@shared/types'
import { sendMail } from './mailSend'
import { isNeverConnectedError } from './netUtil'
import {
  claimScheduledMail,
  failInterruptedScheduledMail,
  getScheduledMailById,
  listDueScheduledMail,
  markScheduledMailFailed,
  markScheduledMailSent,
  releaseScheduledMail
} from './scheduledMailRepository'
import { notifyMailChanged } from '../windowManager'

const CHECK_INTERVAL_MS = 30 * 1000

// Pasada en curso: un envío SMTP puede tardar más que el intervalo del watcher, y sin esto la
// pasada siguiente volvía a encontrar el mismo mensaje 'pending' y lo mandaba de nuevo.
let checking = false

async function processScheduledMail(item: ScheduledMail): Promise<void> {
  if (!claimScheduledMail(item.id)) return
  try {
    await sendMail({
      accountId: item.accountId,
      to: item.to,
      cc: item.cc,
      bcc: item.bcc,
      subject: item.subject,
      bodyText: item.bodyText,
      bodyHtml: item.bodyHtml,
      inReplyTo: item.inReplyTo,
      references: item.references,
      attachments: item.attachments
    })
    markScheduledMailSent(item.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isNeverConnectedError(error)) releaseScheduledMail(item.id, `Sin conexión: ${message}`)
    else markScheduledMailFailed(item.id, message)
  } finally {
    notifyMailChanged()
  }
}

export async function sendScheduledMailNow(id: string): Promise<void> {
  const item = getScheduledMailById(id)
  if (!item) throw new Error('Envío programado no encontrado')
  await processScheduledMail(item)
}

async function checkDue(): Promise<void> {
  // No se consulta net.isOnline(): puede dar falsos negativos y dejar la cola trabada. Intentar sin
  // conexión es barato (falla al resolver el DNS) y deja el mensaje en 'pending' para el próximo ciclo.
  if (checking) return
  checking = true
  try {
    for (const item of listDueScheduledMail(new Date().toISOString())) {
      await processScheduledMail(item)
    }
  } catch (error) {
    console.error('Error revisando los envíos programados:', error)
  } finally {
    checking = false
  }
}

export function startScheduledMailWatcher(): void {
  failInterruptedScheduledMail()
  void checkDue()
  setInterval(() => void checkDue(), CHECK_INTERVAL_MS)
}
