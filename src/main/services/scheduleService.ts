import type { ScheduledMail } from '@shared/types'
import { sendMail } from './mailSend'
import {
  getScheduledMailById,
  listDueScheduledMail,
  markScheduledMailFailed,
  markScheduledMailSent
} from './scheduledMailRepository'

const CHECK_INTERVAL_MS = 30 * 1000

async function processScheduledMail(item: ScheduledMail): Promise<void> {
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
    markScheduledMailFailed(item.id, error instanceof Error ? error.message : String(error))
  }
}

export async function sendScheduledMailNow(id: string): Promise<void> {
  const item = getScheduledMailById(id)
  if (!item) throw new Error('Envío programado no encontrado')
  await processScheduledMail(item)
}

export function startScheduledMailWatcher(): void {
  async function checkDue(): Promise<void> {
    const due = listDueScheduledMail(new Date().toISOString())
    for (const item of due) {
      await processScheduledMail(item)
    }
  }

  checkDue()
  setInterval(checkDue, CHECK_INTERVAL_MS)
}
