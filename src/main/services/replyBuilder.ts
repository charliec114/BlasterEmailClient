import type { Message, Participant } from '@shared/types'
import { getAccountById } from './accountsRepository'
import { getThreadDetail } from './mailRepository'
import { getSetting } from './settingsRepository'

export interface ReplyPlan {
  accountId: string
  to: string[]
  cc: string[]
  subject: string
  inReplyTo: string
  references: string[]
  quotedText: string
  // Mensaje al que se responde, para dar contexto a la IA del redactor.
  context: string
}

function dedupeExcluding(participants: Participant[], excluded: Set<string>): Participant[] {
  const seen = new Set(excluded)
  const result: Participant[] = []
  for (const p of participants) {
    const key = p.email.toLowerCase()
    if (!p.email || seen.has(key)) continue
    seen.add(key)
    result.push(p)
  }
  return result
}

function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
}

// Mismos criterios que "Responder" / "Responder a todos" del Reading Pane, con un agregado:
// si el último mensaje del hilo es uno propio (ej. un recordatorio), la respuesta va a sus
// destinatarios en vez de dirigirse a uno mismo.
export function planReply(accountId: string, threadId: string, replyAll: boolean): ReplyPlan {
  const thread = getThreadDetail(accountId, threadId)
  if (!thread || thread.messages.length === 0) throw new Error('Hilo no encontrado')

  const ownEmail = getAccountById(accountId).email.toLowerCase()
  const last: Message = thread.messages[thread.messages.length - 1]
  const own = new Set([ownEmail])
  const fromSelf = last.from.email.toLowerCase() === ownEmail

  const primary = fromSelf ? last.to : [last.from]
  const to = dedupeExcluding(replyAll ? [...primary, ...(fromSelf ? [] : last.to)] : primary, own)
  if (to.length === 0) throw new Error('No hay a quién responder en este hilo')
  const cc = replyAll
    ? dedupeExcluding(last.cc, new Set([...own, ...to.map((p) => p.email.toLowerCase())]))
    : []

  const english = getSetting('language') === 'en'
  const date = new Date(last.date).toLocaleString(english ? 'en-US' : 'es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  const header = english ? `On ${date}, ${last.from.name} wrote:` : `El ${date}, ${last.from.name} escribió:`

  return {
    accountId,
    to: to.map((p) => p.email),
    cc: cc.map((p) => p.email),
    subject: /^\s*re\s*:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`,
    inReplyTo: last.messageId,
    references: [...last.references, last.messageId],
    quotedText: `${header}\n${quote(last.bodyText)}`,
    context: `${last.from.name}: ${last.bodyText}`
  }
}
