import { createTransport } from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import { getAccountById } from './accountsRepository'
import { resolveSmtpAuth } from './authResolver'
import { stripHtml } from './mailParser'
import { appendToImapFolder } from './imapSync'
import { getSentFolderRemotePath } from './mailRepository'
import { upsertContact } from './contactsRepository'
import type { SendMailInput } from '@shared/types'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br>')
}

export async function sendMail(input: SendMailInput): Promise<void> {
  if (input.to.length === 0) {
    throw new Error('No especificaste ningún destinatario en "Para".')
  }

  const account = getAccountById(input.accountId)
  const smtpAuth = await resolveSmtpAuth(account)

  const signatureHtml = account.signatureHtml.trim()
  const text = signatureHtml ? `${input.bodyText}\n\n--\n${stripHtml(signatureHtml)}` : input.bodyText
  const html = signatureHtml ? `${textToHtml(input.bodyText)}<br><br>${signatureHtml}` : undefined

  const mailOptions = {
    from: account.email,
    to: input.to,
    cc: input.cc.length ? input.cc : undefined,
    bcc: input.bcc.length ? input.bcc : undefined,
    subject: input.subject,
    text,
    html,
    inReplyTo: input.inReplyTo,
    references: input.references,
    attachments: input.attachments.map((a) => ({ filename: a.name, path: a.path }))
  }

  const transporter = createTransport({
    host: account.outgoing.host,
    port: account.outgoing.port,
    secure: account.outgoing.secure,
    auth: smtpAuth.accessToken
      ? { type: 'OAuth2' as const, user: smtpAuth.user, accessToken: smtpAuth.accessToken }
      : { user: smtpAuth.user, pass: smtpAuth.pass }
  })

  await transporter.sendMail(mailOptions)

  if (account.protocol === 'imap') {
    try {
      const sentFolderPath = getSentFolderRemotePath(account.id)
      if (sentFolderPath) {
        const rawMessage: Buffer = await new MailComposer(mailOptions).compile().build()
        await appendToImapFolder(account, sentFolderPath, rawMessage)
      }
    } catch (error) {
      console.error('No se pudo guardar la copia enviada en el servidor:', error)
    }
  }

  const now = new Date().toISOString()
  for (const recipient of [...input.to, ...input.cc, ...input.bcc]) {
    upsertContact(recipient, null, now)
  }
}
