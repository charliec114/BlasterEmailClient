import { useState } from 'react'
import { useAccountStore } from '../store/useAccountStore'
import { useComposeStore, type ComposeDraft } from '../store/useComposeStore'
import { sendInBackground } from '../lib/sendInBackground'
import { textToEditorHtml, htmlToPlainText } from '../lib/richText'
import EmailBodyFrame from './EmailBodyFrame'
import AddressInput from './AddressInput'
import RichTextEditor from './RichTextEditor'
import { useT } from '../i18n/useT'
import type { AttachmentRef, SendMailInput } from '@shared/types'

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

function tomorrowAt(hour: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  return d
}

function nextMondayAt(hour: number): Date {
  const d = new Date()
  const diff = (8 - d.getDay()) % 7 || 7
  d.setDate(d.getDate() + diff)
  d.setHours(hour, 0, 0, 0)
  return d
}

function minDateTimeLocal(): string {
  const d = new Date(Date.now() + 60_000)
  d.setSeconds(0, 0)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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
  const [showCc, setShowCc] = useState(Boolean(draft.cc) || Boolean(draft.bcc))
  const [cc, setCc] = useState(draft.cc ?? '')
  const [bcc, setBcc] = useState(draft.bcc ?? '')
  const [subject, setSubject] = useState(draft.subject ?? '')
  const [body, setBody] = useState(() => draft.bodyHtml ?? textToEditorHtml(draft.body ?? ''))
  const [bodyVersion, setBodyVersion] = useState(0)
  const [assisting, setAssisting] = useState(false)
  const [previousBody, setPreviousBody] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<AttachmentRef[]>(draft.attachments ?? [])
  const [assistingSubject, setAssistingSubject] = useState(false)
  const [error, setError] = useState<string | null>(draft.error ?? null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [customDateTime, setCustomDateTime] = useState('')
  const [scheduling, setScheduling] = useState(false)

  function setBodyExternally(html: string): void {
    setBody(html)
    setBodyVersion((v) => v + 1)
  }

  async function handleSuggestSubject(): Promise<void> {
    setAssistingSubject(true)
    setError(null)
    try {
      const result = await window.api.ai.suggestSubject(draft.context ?? '', htmlToPlainText(body))
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
      const result = await window.api.ai.composeAssist(instruction, draft.context ?? '', htmlToPlainText(body))
      setPreviousBody(snapshot)
      setBodyExternally(textToEditorHtml(result))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setAssisting(false)
    }
  }

  function handleUndoAssist(): void {
    if (previousBody === null) return
    setBodyExternally(previousBody)
    setPreviousBody(null)
  }

  function buildSendInput(): SendMailInput {
    return {
      accountId,
      to: parseAddresses(to),
      cc: parseAddresses(cc),
      bcc: parseAddresses(bcc),
      subject,
      bodyText: htmlToPlainText(body),
      bodyHtml: body,
      inReplyTo: draft.inReplyTo,
      references: draft.references,
      attachments
    }
  }

  // Cierra el redactor al instante y envía en segundo plano (ver sendInBackground): esperar
  // acá a que SMTP y la copia en Enviados terminen dejaba la ventana "colgada" varios segundos.
  function handleSend(): void {
    const input = buildSendInput()
    const restore: ComposeDraft = {
      accountId,
      to,
      cc,
      bcc,
      subject,
      bodyHtml: body,
      inReplyTo: draft.inReplyTo,
      references: draft.references,
      attachments,
      context: draft.context
    }
    closeCompose()
    void sendInBackground(input, restore)
  }

  async function handleSchedule(scheduledFor: Date): Promise<void> {
    if (scheduledFor.getTime() <= Date.now()) {
      setError(t('composeModal.scheduleInPast'))
      return
    }
    setScheduling(true)
    setError(null)
    try {
      await window.api.scheduledMail.create({
        accountId,
        to: parseAddresses(to),
        cc: parseAddresses(cc),
        bcc: parseAddresses(bcc),
        subject,
        bodyText: htmlToPlainText(body),
        bodyHtml: body,
        inReplyTo: draft.inReplyTo,
        references: draft.references,
        attachments,
        scheduledFor: scheduledFor.toISOString()
      })
      setShowSchedule(false)
      closeCompose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setScheduling(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box compose-box">
        <div className="modal-header-row compose-header">
          <h2>{t('composeModal.newMessageTitle')}</h2>
          <button type="button" className="modal-close-btn" title={t('common.close')} onClick={closeCompose}>
            ✕
          </button>
        </div>

        <div className="compose-form">
          <div className="compose-fields">
            {accounts.length > 1 && (
              <div className="compose-row">
                <span className="compose-row-label">{t('composeModal.from')}</span>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label} ({account.email})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="compose-row">
              <span className="compose-row-label">{t('composeModal.to')}</span>
              <AddressInput value={to} onChange={setTo} placeholder={t('composeModal.toPlaceholder')} />
              {!showCc && (
                <button type="button" className="cc-toggle" onClick={() => setShowCc(true)}>
                  {t('composeModal.addCcBcc')}
                </button>
              )}
            </div>

            {showCc && (
              <>
                <div className="compose-row">
                  <span className="compose-row-label">{t('composeModal.cc')}</span>
                  <AddressInput value={cc} onChange={setCc} />
                </div>
                <div className="compose-row">
                  <span className="compose-row-label">{t('composeModal.bcc')}</span>
                  <AddressInput value={bcc} onChange={setBcc} />
                </div>
              </>
            )}

            <div className="compose-row">
              <label className="compose-row-label" htmlFor="compose-subject">
                {t('composeModal.subject')}
              </label>
              <input id="compose-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <button
                type="button"
                className="ai-inline-btn"
                disabled={assistingSubject || (!htmlToPlainText(body) && !draft.context)}
                onClick={handleSuggestSubject}
              >
                {assistingSubject ? t('composeModal.suggestingSubject') : t('composeModal.suggestSubject')}
              </button>
            </div>
          </div>

          {/* div y no label: un label reenvía el click del área editable al primer botón que contiene
              (los de IA), lo que disparaba la asistencia y sacaba el foco del editor. */}
          <div className="compose-body-field">
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
                disabled={assisting || !htmlToPlainText(body)}
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
            <RichTextEditor key={bodyVersion} value={body} onChange={setBody} disabled={assisting} />
          </div>

          {attachments.length > 0 && (
            <ul className="attachments-list compose-attachments">
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

          {signatureHtml && (
            <div className="signature-preview compose-signature">
              <div className="signature-preview-label">{t('composeModal.signatureWillBeAdded')}</div>
              <EmailBodyFrame html={signatureHtml} />
            </div>
          )}
        </div>

        {error && <div className="test-fail form-error compose-error">{error}</div>}

        <div className="modal-actions compose-actions">
          <button type="button" className="reply-btn" onClick={handleAttach}>
            {t('composeModal.attachFile')}
          </button>
          <div className="modal-actions-spacer" />
          <button type="button" className="reply-btn" onClick={closeCompose}>
            {t('common.cancel')}
          </button>
          <div className="send-split-btn">
            <button
              type="button"
              className="reply-btn ai-btn send-main-btn"
              disabled={!isValid || scheduling}
              onClick={handleSend}
            >
              {t('composeModal.send')}
            </button>
            <button
              type="button"
              className="reply-btn ai-btn send-caret-btn"
              disabled={!isValid || scheduling}
              title={t('composeModal.scheduleSend')}
              onClick={() => setShowSchedule((v) => !v)}
            >
              ▾
            </button>
            {showSchedule && (
              <>
                <div className="schedule-menu-overlay" onClick={() => setShowSchedule(false)} />
                <div className="schedule-menu">
                  <button type="button" onClick={() => handleSchedule(tomorrowAt(8))}>
                    {t('composeModal.scheduleTomorrowMorning')}
                  </button>
                  <button type="button" onClick={() => handleSchedule(tomorrowAt(13))}>
                    {t('composeModal.scheduleTomorrowAfternoon')}
                  </button>
                  <button type="button" onClick={() => handleSchedule(nextMondayAt(8))}>
                    {t('composeModal.scheduleMonday')}
                  </button>
                  <div className="schedule-menu-divider" />
                  <label className="schedule-menu-custom">
                    {t('composeModal.scheduleCustom')}
                    <input
                      type="datetime-local"
                      value={customDateTime}
                      min={minDateTimeLocal()}
                      onChange={(e) => setCustomDateTime(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="ai-inline-btn"
                    disabled={!customDateTime}
                    onClick={() => handleSchedule(new Date(customDateTime))}
                  >
                    {t('composeModal.scheduleConfirm')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
