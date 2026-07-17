import { useState } from 'react'
import EmailBodyFrame from './EmailBodyFrame'
import { useT } from '../i18n/useT'
import type { AttachmentMeta, Message } from '@shared/types'

const QUOTE_LINE = /^\s*>/
const QUOTE_HEADER_PATTERNS = [/^el .+ escribió:\s*$/i, /^on .+ wrote:\s*$/i, /^-{2,}\s*mensaje reenviado\s*-{2,}/i]

function splitQuotedText(bodyText: string): { visible: string; quoted: string | null } {
  const lines = bodyText.split('\n')
  let splitIndex = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (QUOTE_LINE.test(line) || QUOTE_HEADER_PATTERNS.some((pattern) => pattern.test(line))) {
      splitIndex = i
      break
    }
  }

  if (splitIndex === -1) return { visible: bodyText, quoted: null }

  return {
    visible: lines.slice(0, splitIndex).join('\n').trimEnd(),
    quoted: lines.slice(splitIndex).join('\n')
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentChip({ attachment }: { attachment: AttachmentMeta }) {
  const { t } = useT()
  const [saving, setSaving] = useState(false)

  async function handleSave(): Promise<void> {
    setSaving(true)
    try {
      await window.api.mail.saveAttachment(attachment.id)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="attachment-chip">
      <span className="attachment-chip-icon">📎</span>
      <span className="attachment-chip-name">{attachment.filename}</span>
      <span className="attachment-chip-size">{formatSize(attachment.size)}</span>
      <button type="button" className="attachment-chip-save" disabled={saving} onClick={handleSave}>
        {saving ? t('messageBody.saving') : t('messageBody.save')}
      </button>
    </div>
  )
}

interface MessageBodyProps {
  message: Message
}

export default function MessageBody({ message }: MessageBodyProps) {
  const { t } = useT()
  const attachmentsList = message.attachments.length > 0 && (
    <div className="attachment-chip-list">
      {message.attachments.map((attachment) => (
        <AttachmentChip key={attachment.id} attachment={attachment} />
      ))}
    </div>
  )

  if (message.bodyHtml) {
    return (
      <>
        <EmailBodyFrame html={message.bodyHtml} />
        {attachmentsList}
      </>
    )
  }

  const { visible, quoted } = splitQuotedText(message.bodyText)

  return (
    <>
      <div className="message-card-body">
        {visible}
        {quoted && (
          <details className="quote-details">
            <summary>{t('messageBody.showFullText')}</summary>
            <pre className="quoted-text">{quoted}</pre>
          </details>
        )}
      </div>
      {attachmentsList}
    </>
  )
}
