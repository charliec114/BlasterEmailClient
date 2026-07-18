import { useState } from 'react'
import { useSettingsStore, type AiProvider, type Language, type ThemePreference } from '../store/useSettingsStore'
import { useT } from '../i18n/useT'

interface SettingsModalProps {
  onClose: () => void
}

const CLOUD_PROVIDERS: { value: 'openai' | 'gemini' | 'anthropic'; modelPlaceholder: string }[] = [
  { value: 'openai', modelPlaceholder: 'gpt-4o-mini' },
  { value: 'gemini', modelPlaceholder: 'gemini-1.5-flash' },
  { value: 'anthropic', modelPlaceholder: 'claude-3-5-haiku-latest' }
]

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

  const aiProvider = useSettingsStore((s) => s.aiProvider)
  const setAiProvider = useSettingsStore((s) => s.setAiProvider)
  const aiStylePrompt = useSettingsStore((s) => s.aiStylePrompt)
  const setAiStylePrompt = useSettingsStore((s) => s.setAiStylePrompt)

  const ollamaBaseUrl = useSettingsStore((s) => s.ollamaBaseUrl)
  const ollamaModel = useSettingsStore((s) => s.ollamaModel)
  const ollamaModels = useSettingsStore((s) => s.ollamaModels)
  const ollamaError = useSettingsStore((s) => s.ollamaError)
  const ollamaLoadingModels = useSettingsStore((s) => s.ollamaLoadingModels)
  const setOllamaBaseUrl = useSettingsStore((s) => s.setOllamaBaseUrl)
  const setOllamaModel = useSettingsStore((s) => s.setOllamaModel)
  const refreshOllamaModels = useSettingsStore((s) => s.refreshOllamaModels)

  const openaiModel = useSettingsStore((s) => s.openaiModel)
  const geminiModel = useSettingsStore((s) => s.geminiModel)
  const anthropicModel = useSettingsStore((s) => s.anthropicModel)
  const setOpenaiModel = useSettingsStore((s) => s.setOpenaiModel)
  const setGeminiModel = useSettingsStore((s) => s.setGeminiModel)
  const setAnthropicModel = useSettingsStore((s) => s.setAnthropicModel)
  const apiKeyStatus = useSettingsStore((s) => s.apiKeyStatus)
  const setApiKey = useSettingsStore((s) => s.setApiKey)

  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({})

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: 'light', label: t('settingsModal.themeLight') },
    { value: 'dark', label: t('settingsModal.themeDark') },
    { value: 'system', label: t('settingsModal.themeSystem') }
  ]

  const languageOptions: { value: Language; label: string }[] = [
    { value: 'es', label: t('settingsModal.languageEs') },
    { value: 'en', label: t('settingsModal.languageEn') }
  ]

  const providerOptions: { value: AiProvider; label: string }[] = [
    { value: 'ollama', label: 'Ollama' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'anthropic', label: 'Anthropic' }
  ]

  const modelByProvider: Record<string, string> = { openai: openaiModel, gemini: geminiModel, anthropic: anthropicModel }
  const setModelByProvider: Record<string, (model: string) => Promise<void>> = {
    openai: setOpenaiModel,
    gemini: setGeminiModel,
    anthropic: setAnthropicModel
  }
  const providerLabel: Record<AiProvider, string> = { ollama: 'Ollama', openai: 'OpenAI', gemini: 'Gemini', anthropic: 'Anthropic' }

  function isProviderReady(provider: AiProvider): boolean {
    if (provider === 'ollama') return ollamaModel !== ''
    return Boolean(apiKeyStatus[provider]) && modelByProvider[provider] !== ''
  }

  const activeModel = aiProvider === 'ollama' ? ollamaModel : modelByProvider[aiProvider]
  const activeReady = isProviderReady(aiProvider)

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

            <p className="ai-provider-hint">{t('settingsModal.aiProviderHint')}</p>

            <label>{t('settingsModal.aiProvider')}</label>
            <div className="protocol-toggle">
              {providerOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={aiProvider === option.value ? 'active' : ''}
                  onClick={() => setAiProvider(option.value)}
                >
                  <span className={`provider-ready-dot ${isProviderReady(option.value) ? 'ready' : ''}`} />
                  {option.label}
                </button>
              ))}
            </div>

            <div className={`ai-provider-status ${activeReady ? 'ready' : 'not-ready'}`}>
              {activeReady
                ? t('settingsModal.currentlyUsing', { provider: providerLabel[aiProvider], model: activeModel })
                : t('settingsModal.currentlyUsingIncomplete', { provider: providerLabel[aiProvider] })}
            </div>

            {aiProvider === 'ollama' && (
              <>
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
              </>
            )}

            {CLOUD_PROVIDERS.filter((p) => p.value === aiProvider).map((provider) => (
              <div key={provider.value} className="form-grid">
                <label>
                  {t('settingsModal.apiKey')}
                  <input
                    type="password"
                    value={apiKeyInputs[provider.value] ?? ''}
                    onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, [provider.value]: e.target.value }))}
                    onBlur={(e) => {
                      if (e.target.value) setApiKey(provider.value, e.target.value)
                    }}
                    placeholder={apiKeyStatus[provider.value] ? t('settingsModal.apiKeyConfiguredHint') : t('settingsModal.apiKeyPlaceholder')}
                  />
                </label>
                <label>
                  {t('settingsModal.model')}
                  <input
                    value={modelByProvider[provider.value]}
                    onChange={(e) => setModelByProvider[provider.value](e.target.value)}
                    placeholder={provider.modelPlaceholder}
                  />
                </label>
              </div>
            ))}

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
              <img src="/icon.png" alt="Blaster Email Client" className="about-icon" />
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
