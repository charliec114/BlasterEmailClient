import { useState } from 'react'
import { useAccountStore } from '../store/useAccountStore'
import { useMailDataStore } from '../store/useMailDataStore'
import { useComposeStore, type ComposeDraft } from '../store/useComposeStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { playSentMailSound } from '../lib/sound'
import EmailBodyFrame from './EmailBodyFrame'
import AddressInput from './AddressInput'
import { useT } from '../i18n/useT'
import type { AttachmentRef } from '@shared/types'

function parseAddresses(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((v) => v.trim())
    .filter(Boolean)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface ComposeModalProps {
  draft: ComposeDraft
}

export default function ComposeModal({ draft }: ComposeModalProps) {
  const { t } = useT()
  const accounts = useAccountStore((s) => s.accounts)
  const closeCompose = useComposeStore((s) => s.closeCompose)

  const [accountId, setAccountId] = useState(draft.accountId)
  const [to, setTo] = useState(draft.to ?? '')
  const [showCc, setShowCc] = useState(Boolean(draft.cc))
  const [cc, setCc] = useState(draft.cc ?? '')
  const [bcc, setBcc] = useState('')
  const [subject, setSubject] = useState(draft.subject ?? '')
  const [body, setBody] = useState(draft.body ?? '')
  const [sending, setSending] = useState(false)
  const [assisting, setAssisting] = useState(false)
  const [previousBody, setPreviousBody] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<AttachmentRef[]>([])
  const [assistingSubject, setAssistingSubject] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSuggestSubject(): Promise<void> {
    setAssistingSubject(true)
    setError(null)
    try {
      const result = await window.api.ollama.suggestSubject(draft.context ?? '', body)
      setSubject(result)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setAssistingSubject(false)
    }
  }

  async function handleAttach(): Promise<void> {
    const picked = await window.api.dialog.pickFiles()
    setAttachments((prev) => {
      const existingPaths = new Set(prev.map((a) => a.path))
      return [...prev, ...picked.filter((a) => !existingPaths.has(a.path))]
    })
  }

  function removeAttachment(path: string): void {
    setAttachments((prev) => prev.filter((a) => a.path !== path))
  }

  const isValid = accountId !== '' && parseAddresses(to).length > 0
  const signatureHtml = accounts.find((a) => a.id === accountId)?.signatureHtml.trim()

  async function handleAssist(mode: 'improve' | 'suggest'): Promise<void> {
    const instruction =
      mode === 'improve'
        ? 'Mejorá este borrador conservando su intención y el idioma original: corregí gramática y mejorá la claridad.'
        : 'Redactá una respuesta breve y cordial para esta conversación.'

    const snapshot = body
    setAssisting(true)
    setError(null)
    try {
      const result = await window.api.ollama.composeAssist(instruction, draft.context ?? '', body)
      setPreviousBody(snapshot)
      setBody(result)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setAssisting(false)
    }
  }

  function handleUndoAssist(): void {
    if (previousBody === null) return
    setBody(previousBody)
    setPreviousBody(null)
  }

  async function handleSend(): Promise<void> {
    setSending(true)
    setError(null)
    try {
      await window.api.mail.send({
        accountId,
        to: parseAddresses(to),
        cc: parseAddresses(cc),
        bcc: parseAddresses(bcc),
        subject,
        bodyText: body,
        inReplyTo: draft.inReplyTo,
        references: draft.references,
        attachments
      })
      if (useSettingsStore.getState().soundEnabled) playSentMailSound()
      useMailDataStore.getState().syncAccount(accountId)
      closeCompose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box compose-box">
        <div className="modal-header-row">
          <h2>{t('composeModal.newMessageTitle')}</h2>
          <button type="button" className="modal-close-btn" title={t('common.close')} onClick={closeCompose}>
            ✕
          </button>
        </div>

        <div className="form-grid">
          {accounts.length > 1 && (
            <label>
              {t('composeModal.from')}
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName} ({account.email})
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            {t('composeModal.to')}
            <AddressInput value={to} onChange={setTo} placeholder={t('composeModal.toPlaceholder')} />
          </label>

          {!showCc && (
            <button type="button" className="cc-toggle" onClick={() => setShowCc(true)}>
              {t('composeModal.addCcBcc')}
            </button>
          )}

          {showCc && (
            <>
              <label>
                {t('composeModal.cc')}
                <AddressInput value={cc} onChange={setCc} />
              </label>
              <label>
                {t('composeModal.bcc')}
                <AddressInput value={bcc} onChange={setBcc} />
              </label>
            </>
          )}

          <label>
            <div className="subject-row">
              <span>{t('composeModal.subject')}</span>
              <button
                type="button"
                className="ai-inline-btn"
                disabled={assistingSubject || (!body.trim() && !draft.context)}
                onClick={handleSuggestSubject}
              >
                {assistingSubject ? t('composeModal.suggestingSubject') : t('composeModal.suggestSubject')}
              </button>
            </div>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>

          <label>
            <div className="compose-body-toolbar">
              {draft.context && (
                <button
                  type="button"
                  className="ai-inline-btn"
                  disabled={assisting}
                  onClick={() => handleAssist('suggest')}
                >
                  {t('composeModal.suggestReply')}
                </button>
              )}
              <button
                type="button"
                className="ai-inline-btn"
                disabled={assisting || !body.trim()}
                onClick={() => handleAssist('improve')}
              >
                {t('composeModal.improveWriting')}
              </button>
              {previousBody !== null && !assisting && (
                <button type="button" className="ai-inline-btn ai-undo-btn" onClick={handleUndoAssist}>
                  {t('composeModal.undo')}
                </button>
              )}
              {assisting && <span className="ai-inline-status">{t('composeModal.writing')}</span>}
            </div>
            <textarea className="compose-body" value={body} onChange={(e) => setBody(e.target.value)} rows={14} />
          </label>

          <div className="attachments-section">
            <button type="button" className="cc-toggle" onClick={handleAttach}>
              {t('composeModal.attachFile')}
            </button>
            {attachments.length > 0 && (
              <ul className="attachments-list">
                {attachments.map((attachment) => (
                  <li key={attachment.path} className="attachment-row">
                    <span className="attachment-name">{attachment.name}</span>
                    <span className="attachment-size">{formatSize(attachment.size)}</span>
                    <button
                      type="button"
                      className="attachment-remove-btn"
                      title={t('composeModal.removeAttachment')}
                      onClick={() => removeAttachment(attachment.path)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {signatureHtml && (
            <div className="signature-preview">
              <div className="signature-preview-label">{t('composeModal.signatureWillBeAdded')}</div>
              <EmailBodyFrame html={signatureHtml} />
            </div>
          )}
        </div>

        {error && <div className="test-fail form-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="reply-btn" onClick={closeCompose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="reply-btn ai-btn" disabled={!isValid || sending} onClick={handleSend}>
            {sending ? t('composeModal.sending') : t('composeModal.send')}
          </button>
        </div>
      </div>
    </div>
  )
}
