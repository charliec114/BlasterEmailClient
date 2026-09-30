import { getAllSettings, getSetting, setSetting } from './settingsRepository'
import { getApiKey, setApiKey } from './apiKeysRepository'
import { AI_API_KEY_PROVIDER } from './aiRouter'

const MIGRATED_FLAG = 'aiConfigMigrated'

// Endpoints de compatibilidad OpenAI de los proveedores que antes tenían cliente propio.
const LEGACY_PROVIDERS = {
  openai: { baseUrl: 'https://api.openai.com/v1', modelKey: 'openaiModel' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', modelKey: 'geminiModel' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', modelKey: 'anthropicModel' }
} as const

// Antes había 4 proveedores (local/OpenAI/Gemini/Anthropic), cada uno con su propia
// configuración. Ahora hay una sola API compatible con OpenAI (URL + modelo + token): se copia
// a ella la configuración del proveedor que estaba activo para que siga funcionando igual.
export function migrateLegacyAiConfig(): void {
  if (getSetting(MIGRATED_FLAG)) return

  const settings = getAllSettings()
  const provider = settings.aiProvider || 'ollama'

  if (provider === 'ollama') {
    if (settings.ollamaBaseUrl || settings.ollamaModel) {
      const root = (settings.ollamaBaseUrl || 'http://localhost:11434').trim().replace(/\/+$/, '').replace(/\/v1$/, '')
      setSetting('aiBaseUrl', `${root}/v1`)
      setSetting('aiModel', settings.ollamaModel || '')
    }
  } else if (provider in LEGACY_PROVIDERS) {
    const legacy = LEGACY_PROVIDERS[provider as keyof typeof LEGACY_PROVIDERS]
    setSetting('aiBaseUrl', legacy.baseUrl)
    setSetting('aiModel', settings[legacy.modelKey] || '')
    const key = getApiKey(provider)
    if (key) setApiKey(AI_API_KEY_PROVIDER, key)
  }

  setSetting(MIGRATED_FLAG, 'true')
}
