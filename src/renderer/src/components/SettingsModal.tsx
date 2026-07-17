import { useSettingsStore, type Language, type ThemePreference } from '../store/useSettingsStore'
import { useT } from '../i18n/useT'

interface SettingsModalProps {
  onClose: () => void
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { t } = useT()
  const theme = useSettingsStore((s) => s.theme)
  const language = useSettingsStore((s) => s.language)
  const soundEnabled = useSettingsStore((s) => s.soundEnabled)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const setLanguage = useSettingsStore((s) => s.setLanguage)
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled)

  const ollamaBaseUrl = useSettingsStore((s) => s.ollamaBaseUrl)
  const ollamaModel = useSettingsStore((s) => s.ollamaModel)
  const ollamaStylePrompt = useSettingsStore((s) => s.ollamaStylePrompt)
  const ollamaModels = useSettingsStore((s) => s.ollamaModels)
  const ollamaError = useSettingsStore((s) => s.ollamaError)
  const ollamaLoadingModels = useSettingsStore((s) => s.ollamaLoadingModels)
  const setOllamaBaseUrl = useSettingsStore((s) => s.setOllamaBaseUrl)
  const setOllamaModel = useSettingsStore((s) => s.setOllamaModel)
  const setOllamaStylePrompt = useSettingsStore((s) => s.setOllamaStylePrompt)
  const refreshOllamaModels = useSettingsStore((s) => s.refreshOllamaModels)

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: 'light', label: t('settingsModal.themeLight') },
    { value: 'dark', label: t('settingsModal.themeDark') },
    { value: 'system', label: t('settingsModal.themeSystem') }
  ]

  const languageOptions: { value: Language; label: string }[] = [
    { value: 'es', label: t('settingsModal.languageEs') },
    { value: 'en', label: t('settingsModal.languageEn') }
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2>{t('settingsModal.title')}</h2>

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

          <fieldset>
            <legend>{t('settingsModal.aiSection')}</legend>
            <label>
              {t('settingsModal.server')}
              <input
                value={ollamaBaseUrl}
                onChange={(e) => setOllamaBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
            </label>

            <div className="field-row">
              <label>
                {t('settingsModal.model')}
                <select value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)}>
                  <option value="">{t('settingsModal.noModelSelected')}</option>
                  {ollamaModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="reply-btn" disabled={ollamaLoadingModels} onClick={refreshOllamaModels}>
                {ollamaLoadingModels ? t('settingsModal.searchingModels') : t('settingsModal.refreshModels')}
              </button>
            </div>

            {ollamaError && <div className="test-fail">{t('settingsModal.ollamaError', { error: ollamaError })}</div>}

            <label>
              {t('settingsModal.stylePrompt')}
              <textarea
                rows={3}
                value={ollamaStylePrompt}
                onChange={(e) => setOllamaStylePrompt(e.target.value)}
                placeholder={t('settingsModal.stylePromptPlaceholder')}
              />
            </label>
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
