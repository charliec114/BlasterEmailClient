import { useEffect } from 'react'
import { useSettingsStore } from '../store/useSettingsStore'
import { useT } from '../i18n/useT'

export default function UpdateModal() {
  const { t } = useT()
  const updateInfo = useSettingsStore((s) => s.updateInfo)
  const dismissed = useSettingsStore((s) => s.updateDismissed)
  const dismissUpdate = useSettingsStore((s) => s.dismissUpdate)
  const visible = !!updateInfo?.hasUpdate && !dismissed

  useEffect(() => {
    if (!visible) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') dismissUpdate()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [visible, dismissUpdate])

  if (!updateInfo || !visible) return null

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && dismissUpdate()}>
      <div className="modal-box update-modal" role="dialog" aria-modal="true">
        <div className="modal-header-row">
          <h2>{t('updateModal.title')}</h2>
          <button type="button" className="modal-close-btn" aria-label={t('common.close')} onClick={dismissUpdate}>
            ✕
          </button>
        </div>
        <p>{t('updateModal.body', { latest: updateInfo.latestVersion, current: updateInfo.currentVersion })}</p>
        <div className="modal-actions">
          <button type="button" className="reply-btn" onClick={dismissUpdate}>
            {t('updateModal.later')}
          </button>
          <a
            href={updateInfo.url}
            target="_blank"
            rel="noreferrer"
            className="reply-btn update-modal-download"
            onClick={dismissUpdate}
          >
            {t('updateModal.download')}
          </a>
        </div>
      </div>
    </div>
  )
}
