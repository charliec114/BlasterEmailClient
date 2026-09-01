import { useEffect } from 'react'
import { useAccountStore } from '../store/useAccountStore'
import { useScheduledMailStore } from '../store/useScheduledMailStore'
import { useComposeStore } from '../store/useComposeStore'
import { useT } from '../i18n/useT'
import type { ScheduledMail } from '@shared/types'

export default function ScheduledPanel() {
  const { t, locale } = useT()
  const accounts = useAccountStore((s) => s.accounts)
  const items = useScheduledMailStore((s) => s.items)
  const loading = useScheduledMailStore((s) => s.loading)
  const fetchScheduled = useScheduledMailStore((s) => s.fetch)
  const cancelScheduled = useScheduledMailStore((s) => s.cancel)
  const sendNow = useScheduledMailStore((s) => s.sendNow)
  const openCompose = useComposeStore((s) => s.openCompose)

  useEffect(() => {
    fetchScheduled()
  }, [fetchScheduled])

  function accountLabel(accountId: string): string {
    return accounts.find((a) => a.id === accountId)?.label ?? accountId
  }

  function formatScheduledFor(iso: string): string {
    return new Date(iso).toLocaleString(locale, {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  async function handleEdit(item: ScheduledMail): Promise<void> {
    await cancelScheduled(item.id)
    openCompose({
      accountId: item.accountId,
      to: item.to.join(', '),
      cc: item.cc.join(', '),
      bcc: item.bcc.join(', '),
      subject: item.subject,
      bodyHtml: item.bodyHtml,
      body: item.bodyHtml ? undefined : item.bodyText,
      attachments: item.attachments,
      inReplyTo: item.inReplyTo,
      references: item.references
    })
  }

  return (
    <section className="scheduled-panel">
      <header className="scheduled-panel-header">
        <h1>🕒 {t('sidebar.scheduled')}</h1>
        <p className="scheduled-panel-description">{t('scheduledPanel.description')}</p>
      </header>

      <div className="scheduled-panel-body">
        {loading && items.length === 0 && <p className="scheduled-panel-empty">{t('common.loading')}</p>}
        {!loading && items.length === 0 && <p className="scheduled-panel-empty">{t('scheduledPanel.empty')}</p>}

        {items.length > 0 && (
          <ul className="scheduled-list">
            {items.map((item) => (
              <li key={item.id} className="scheduled-row">
                <div className="scheduled-row-main">
                  <div className="scheduled-row-top">
                    <span className="scheduled-row-account">{accountLabel(item.accountId)}</span>
                    <span className="scheduled-row-to">{item.to.join(', ')}</span>
                  </div>
                  <div className="scheduled-row-subject">{item.subject || t('scheduledPanel.noSubject')}</div>
                  <div className={`scheduled-row-time ${item.status === 'failed' ? 'error' : ''}`}>
                    {item.status === 'failed'
                      ? t('scheduledPanel.failed', { error: item.error ?? '' })
                      : t('scheduledPanel.scheduledFor', { date: formatScheduledFor(item.scheduledFor) })}
                  </div>
                </div>
                <div className="scheduled-row-actions">
                  <button type="button" className="cc-toggle" onClick={() => sendNow(item.id)}>
                    {t('scheduledPanel.sendNow')}
                  </button>
                  <button type="button" className="cc-toggle" onClick={() => handleEdit(item)}>
                    {t('scheduledPanel.edit')}
                  </button>
                  <button
                    type="button"
                    className="attachment-remove-btn"
                    title={t('scheduledPanel.cancel')}
                    onClick={() => cancelScheduled(item.id)}
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
