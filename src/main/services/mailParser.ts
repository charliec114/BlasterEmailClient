import { simpleParser } from 'mailparser'
import type { AddressObject } from 'mailparser'
import type { Readable } from 'stream'

export interface ParsedParticipant {
  name: string
  email: string
}

export interface ParsedAttachment {
  filename: string
  contentType: string
  size: number
  content: Buffer
}

export interface ParsedMessage {
  messageId: string
  inReplyTo: string | null
  references: string[]
  subject: string
  fromName: string
  fromEmail: string
  to: ParsedParticipant[]
  cc: ParsedParticipant[]
  date: string
  snippet: string
  bodyText: string
  bodyHtml: string | null
  attachments: ParsedAttachment[]
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractParticipants(addr: AddressObject | AddressObject[] | undefined): ParsedParticipant[] {
  if (!addr) return []
  const objects = Array.isArray(addr) ? addr : [addr]
  const result: ParsedParticipant[] = []
  for (const obj of objects) {
    for (const entry of obj.value) {
      if (entry.address) {
        result.push({ name: entry.name || entry.address, email: entry.address })
      }
    }
  }
  return result
}

export async function parseRawMessage(source: Buffer | Readable | string): Promise<ParsedMessage> {
  const parsed = await simpleParser(source)

  const from = parsed.from?.value[0]
  const bodyText = parsed.text?.trim() || (parsed.html ? stripHtml(parsed.html) : '')

  return {
    messageId: parsed.messageId || `<generated-${Date.now()}-${Math.random().toString(36).slice(2)}@local>`,
    inReplyTo: parsed.inReplyTo ?? null,
    references: Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [],
    subject: parsed.subject || '(sin asunto)',
    fromName: from?.name || from?.address || 'Desconocido',
    fromEmail: from?.address || '',
    to: extractParticipants(parsed.to),
    cc: extractParticipants(parsed.cc),
    date: (parsed.date ?? new Date()).toISOString(),
    snippet: bodyText.slice(0, 160),
    bodyText,
    bodyHtml: typeof parsed.html === 'string' ? parsed.html : null,
    attachments: parsed.attachments
      .filter((a) => !a.related)
      .map((a) => ({
        filename: a.filename || 'adjunto',
        contentType: a.contentType,
        size: a.size,
        content: a.content
      }))
  }
}
