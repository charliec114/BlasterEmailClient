import { useEffect } from 'react'
import { useAccountStore } from '../store/useAccountStore'
import { useQueuedDraftsStore } from '../store/useQueuedDraftsStore'
import { useComposeStore } from '../store/useComposeStore'
import { htmlToPlainText } from '../lib/richText'
import { useT } from '../i18n/useT'
import type { QueuedDraft } from '@shared/types'

function previewOf(item: QueuedDraft): string {
  const { draft } = item
  const text = draft.bodyHtml ? htmlToPlainText(draft.bodyHtml) : (draft.body ?? '')
  return text.replace(/\s+/g, ' ').trim().slice(0, 160)
}

export default function DraftsPanel() {
  const { t, locale } = useT()
  const accounts = useAccountStore((s) => s.accounts)
  const items = useQueuedDraftsStore((s) => s.items)
  const loading = useQueuedDraftsStore((s) => s.loading)
  const fetchDrafts = useQueuedDraftsStore((s) => s.fetch)
  const discard = useQueuedDraftsStore((s) => s.discard)
  const openCompose = useComposeStore((s) => s.openCompose)
  const composeOpen = useComposeStore((s) => s.draft !== null)

  useEffect(() => {
    void fetchDrafts()
  }, [fetchDrafts])

  function accountLabel(accountId: string): string {
    return accounts.find((a) => a.id === accountId)?.label ?? accountId
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  // Abrir NO saca el borrador de la lista: sale cuando se envía, se programa o se descarta, así que
  // cerrar el redactor sin enviar no lo pierde.
  function handleOpen(item: QueuedDraft): void {
    openCompose({ ...item.draft, queuedDraftId: item.id })
  }

  return (
    <section className="scheduled-panel">
      <header className="scheduled-panel-header">
        <h1>📝 {t('sidebar.drafts')}</h1>
        <p className="scheduled-panel-description">{t('draftsPanel.description')}</p>
      </header>

      <div className="scheduled-panel-body">
        {loading && items.length === 0 && <p className="scheduled-panel-empty">{t('common.loading')}</p>}
        {!loading && items.length === 0 && <p className="scheduled-panel-empty">{t('draftsPanel.empty')}</p>}

        {items.length > 0 && (
          <ul className="scheduled-list">
            {items.map((item) => (
              <li key={item.id} className="scheduled-row">
                <div className="scheduled-row-main">
                  <div className="scheduled-row-top">
                    <span className="scheduled-row-account">{accountLabel(item.draft.accountId)}</span>
                    <span className="scheduled-row-to">
                      {item.draft.to || t('draftsPanel.noRecipient')} · {formatDate(item.createdAt)}
                    </span>
                  </div>
                  <div className="scheduled-row-subject">{item.draft.subject || t('scheduledPanel.noSubject')}</div>
                  <div className="draft-row-preview">{previewOf(item)}</div>
                  {item.draft.scheduledFor && (
                    <div className="scheduled-row-time">
                      {t('draftsPanel.proposedSend', { date: formatDate(item.draft.scheduledFor) })}
                    </div>
                  )}
                </div>
                <div className="scheduled-row-actions">
                  <button type="button" className="cc-toggle" disabled={composeOpen} onClick={() => handleOpen(item)}>
                    {t('draftsPanel.open')}
                  </button>
                  <button
                    type="button"
                    className="attachment-remove-btn"
                    title={t('draftsPanel.discard')}
                    onClick={() => void discard(item.id)}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
