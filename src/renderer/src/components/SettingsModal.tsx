import { useState } from 'react'
import { useSettingsStore, type Language, type ThemePreference } from '../store/useSettingsStore'
import { useT } from '../i18n/useT'

interface SettingsModalProps {
  onClose: () => void
}

const AI_KEY_PROVIDER = 'ai'

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { t } = useT()
  const theme = useSettingsStore((s) => s.theme)
  const language = useSettingsStore((s) => s.language)
  const soundEnabled = useSettingsStore((s) => s.soundEnabled)
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const setLanguage = useSettingsStore((s) => s.setLanguage)
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled)
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled)

  const appVersion = useSettingsStore((s) => s.appVersion)
  const updateInfo = useSettingsStore((s) => s.updateInfo)
  const checkingUpdate = useSettingsStore((s) => s.checkingUpdate)
  const updateError = useSettingsStore((s) => s.updateError)
  const checkForUpdate = useSettingsStore((s) => s.checkForUpdate)

  const aiStylePrompt = useSettingsStore((s) => s.aiStylePrompt)
  const setAiStylePrompt = useSettingsStore((s) => s.setAiStylePrompt)

  const aiBaseUrl = useSettingsStore((s) => s.aiBaseUrl)
  const aiModel = useSettingsStore((s) => s.aiModel)
  const aiModels = useSettingsStore((s) => s.aiModels)
  const aiModelsError = useSettingsStore((s) => s.aiModelsError)
  const aiLoadingModels = useSettingsStore((s) => s.aiLoadingModels)
  const setAiBaseUrl = useSettingsStore((s) => s.setAiBaseUrl)
  const setAiModel = useSettingsStore((s) => s.setAiModel)
  const refreshAiModels = useSettingsStore((s) => s.refreshAiModels)
  const apiKeyStatus = useSettingsStore((s) => s.apiKeyStatus)
  const setApiKey = useSettingsStore((s) => s.setApiKey)

  const [apiKeyInput, setApiKeyInput] = useState('')

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: 'light', label: t('settingsModal.themeLight') },
    { value: 'dark', label: t('settingsModal.themeDark') },
    { value: 'system', label: t('settingsModal.themeSystem') }
  ]

  const languageOptions: { value: Language; label: string }[] = [
    { value: 'es', label: t('settingsModal.languageEs') },
    { value: 'en', label: t('settingsModal.languageEn') }
  ]

  // El token es opcional (los servidores locales no lo piden): alcanza con URL y modelo.
  const aiReady = aiBaseUrl.trim() !== '' && aiModel.trim() !== ''
  const hasApiKey = Boolean(apiKeyStatus[AI_KEY_PROVIDER])

  function saveApiKey(): void {
    if (apiKeyInput.trim()) {
      setApiKey(AI_KEY_PROVIDER, apiKeyInput).then(refreshAiModels)
      setApiKeyInput('')
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header-row">
          <h2>{t('settingsModal.title')}</h2>
          <button type="button" className="modal-close-btn" title={t('common.close')} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="form-grid">
          <label>{t('settingsModal.appearance')}</label>
          <div className="protocol-toggle">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={theme === option.value ? 'active' : ''}
                onClick={() => setTheme(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label>{t('settingsModal.language')}</label>
          <div className="protocol-toggle">
            {languageOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={language === option.value ? 'active' : ''}
                onClick={() => setLanguage(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="checkbox-label">
            <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />
            {t('settingsModal.sound')}
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(e) => setNotificationsEnabled(e.target.checked)}
            />
            {t('settingsModal.notifications')}
          </label>

          <fieldset>
            <legend>{t('settingsModal.aiSection')}</legend>

            <p className="ai-provider-hint">{t('settingsModal.aiApiHint')}</p>

            <div className={`ai-provider-status ${aiReady ? 'ready' : 'not-ready'}`}>
              {aiReady
                ? t('settingsModal.currentlyUsing', { model: aiModel })
                : t('settingsModal.currentlyUsingIncomplete')}
            </div>

            <label>
              <span>
                {t('settingsModal.aiApiUrl')}{' '}
                <span className="info-tooltip" title={t('settingsModal.aiApiExamples')}>
                  ⓘ
                </span>
              </span>
              <input
                value={aiBaseUrl}
                onChange={(e) => setAiBaseUrl(e.target.value)}
                onBlur={refreshAiModels}
                placeholder="http://localhost:11434/v1"
              />
            </label>

            <label>
              {t('settingsModal.aiApiToken')}
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onBlur={saveApiKey}
                placeholder={hasApiKey ? t('settingsModal.apiKeyConfiguredHint') : t('settingsModal.aiApiTokenPlaceholder')}
              />
            </label>
            {hasApiKey && (
              <button
                type="button"
                className="reply-btn"
                onClick={() => setApiKey(AI_KEY_PROVIDER, '').then(refreshAiModels)}
              >
                {t('settingsModal.aiApiTokenRemove')}
              </button>
            )}

            <div className="field-row">
              <label>
                {t('settingsModal.model')}
                <input
                  list="ai-model-suggestions"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder="llama3.1"
                />
                <datalist id="ai-model-suggestions">
                  {aiModels.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </label>
              <button type="button" className="reply-btn" disabled={aiLoadingModels || !aiBaseUrl.trim()} onClick={refreshAiModels}>
                {aiLoadingModels ? t('settingsModal.searchingModels') : t('settingsModal.refreshModels')}
              </button>
            </div>

            {aiModelsError && <div className="ai-provider-hint">{t('settingsModal.aiModelsError', { error: aiModelsError })}</div>}

            <label>
              {t('settingsModal.stylePrompt')}
              <textarea
                rows={3}
                value={aiStylePrompt}
                onChange={(e) => setAiStylePrompt(e.target.value)}
                placeholder={t('settingsModal.stylePromptPlaceholder')}
              />
            </label>
          </fieldset>

          <fieldset>
            <legend>{t('settingsModal.aboutSection')}</legend>
            <div className="about-panel">
              <img src="./icon.png" alt="Blaster Email Client" className="about-icon" />
              <div className="about-info">
                <div className="about-name">
                  Blaster <span className="about-name-accent">Email Client</span>
                </div>
                <div className="about-version">{t('settingsModal.version', { version: appVersion || '…' })}</div>
                <p className="about-tagline">{t('settingsModal.aboutTagline')}</p>
                <div className="about-links">
                  <a href="https://blaster.com.ar" target="_blank" rel="noreferrer" className="about-link">
                    blaster.com.ar
                  </a>
                  <a
                    href="https://github.com/charliec114/BlasterEmailClient"
                    target="_blank"
                    rel="noreferrer"
                    className="about-link"
                  >
                    GitHub
                  </a>
                </div>
              </div>
            </div>

            <div className="about-update-row">
              <button type="button" className="reply-btn" disabled={checkingUpdate} onClick={checkForUpdate}>
                {checkingUpdate ? t('settingsModal.checkingUpdate') : t('settingsModal.checkUpdate')}
              </button>
              {updateInfo && !updateInfo.hasUpdate && <span className="test-ok">{t('settingsModal.upToDate')}</span>}
              {updateInfo && updateInfo.hasUpdate && (
                <a href={updateInfo.url} target="_blank" rel="noreferrer" className="update-available-link">
                  {t('settingsModal.updateAvailable', { version: updateInfo.latestVersion })}
                </a>
              )}
              {updateError && <span className="test-fail">{t('settingsModal.updateCheckError', { error: updateError })}</span>}
            </div>
          </fieldset>
        </div>

        <div className="modal-actions">
          <button type="button" className="reply-btn ai-btn" onClick={onClose}>
            {t('common.done')}
          </button>
        </div>
      </div>
    </div>
  )
}
