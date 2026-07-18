import { create } from 'zustand'

export type ThemePreference = 'light' | 'dark' | 'system'
export type Language = 'es' | 'en'
export type AiProvider = 'ollama' | 'openai' | 'gemini' | 'anthropic'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface SettingsStore {
  theme: ThemePreference
  language: Language
  soundEnabled: boolean
  loaded: boolean
  aiProvider: AiProvider
  aiStylePrompt: string
  ollamaBaseUrl: string
  ollamaModel: string
  ollamaModels: string[]
  ollamaError: string | null
  ollamaLoadingModels: boolean
  openaiModel: string
  geminiModel: string
  anthropicModel: string
  apiKeyStatus: Record<string, boolean>
  sidebarOrder: string[]
  collapsedAccountIds: string[]
  loadSettings: () => Promise<void>
  setTheme: (theme: ThemePreference) => Promise<void>
  setLanguage: (language: Language) => Promise<void>
  setSoundEnabled: (enabled: boolean) => Promise<void>
  setAiProvider: (provider: AiProvider) => Promise<void>
  setAiStylePrompt: (stylePrompt: string) => Promise<void>
  setOllamaBaseUrl: (baseUrl: string) => Promise<void>
  setOllamaModel: (model: string) => Promise<void>
  refreshOllamaModels: () => Promise<void>
  setOpenaiModel: (model: string) => Promise<void>
  setGeminiModel: (model: string) => Promise<void>
  setAnthropicModel: (model: string) => Promise<void>
  setApiKey: (provider: string, key: string) => Promise<void>
  refreshApiKeyStatus: () => Promise<void>
  setSidebarOrder: (order: string[]) => Promise<void>
  toggleAccountCollapsed: (accountId: string) => Promise<void>
}

function parseJsonArray(value: string | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function applyTheme(theme: ThemePreference): void {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  theme: 'system',
  language: 'es',
  soundEnabled: true,
  loaded: false,
  aiProvider: 'ollama',
  aiStylePrompt: '',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: '',
  ollamaModels: [],
  ollamaError: null,
  ollamaLoadingModels: false,
  openaiModel: '',
  geminiModel: '',
  anthropicModel: '',
  apiKeyStatus: {},
  sidebarOrder: [],
  collapsedAccountIds: [],

  loadSettings: async () => {
    const all = await window.api.settings.getAll()
    const theme = (all.theme as ThemePreference | undefined) ?? 'system'
    const soundEnabled = all.soundEnabled !== 'false'
    applyTheme(theme)
    const language = (all.language as Language | undefined) ?? 'es'
    const aiProvider = (all.aiProvider as AiProvider | undefined) ?? 'ollama'
    set({
      theme,
      language,
      soundEnabled,
      loaded: true,
      aiProvider,
      aiStylePrompt: all.aiStylePrompt || '',
      ollamaBaseUrl: all.ollamaBaseUrl || 'http://localhost:11434',
      ollamaModel: all.ollamaModel || '',
      openaiModel: all.openaiModel || '',
      geminiModel: all.geminiModel || '',
      anthropicModel: all.anthropicModel || '',
      sidebarOrder: parseJsonArray(all.sidebarOrder),
      collapsedAccountIds: parseJsonArray(all.collapsedAccountIds)
    })
    get().refreshOllamaModels()
    get().refreshApiKeyStatus()
  },

  setTheme: async (theme) => {
    applyTheme(theme)
    set({ theme })
    await window.api.settings.set('theme', theme)
  },

  setLanguage: async (language) => {
    set({ language })
    await window.api.settings.set('language', language)
  },

  setSoundEnabled: async (enabled) => {
    set({ soundEnabled: enabled })
    await window.api.settings.set('soundEnabled', String(enabled))
  },

  setAiProvider: async (provider) => {
    set({ aiProvider: provider })
    await window.api.settings.set('aiProvider', provider)
  },

  setAiStylePrompt: async (stylePrompt) => {
    set({ aiStylePrompt: stylePrompt })
    await window.api.settings.set('aiStylePrompt', stylePrompt)
  },

  setOllamaBaseUrl: async (baseUrl) => {
    set({ ollamaBaseUrl: baseUrl })
    await window.api.settings.set('ollamaBaseUrl', baseUrl)
  },

  setOllamaModel: async (model) => {
    set({ ollamaModel: model })
    await window.api.settings.set('ollamaModel', model)
  },

  refreshOllamaModels: async () => {
    set({ ollamaLoadingModels: true, ollamaError: null })
    try {
      const models = await window.api.ollama.listModels(get().ollamaBaseUrl)
      set({ ollamaModels: models, ollamaLoadingModels: false })
    } catch (error) {
      set({ ollamaModels: [], ollamaError: errorMessage(error), ollamaLoadingModels: false })
    }
  },

  setOpenaiModel: async (model) => {
    set({ openaiModel: model })
    await window.api.settings.set('openaiModel', model)
  },

  setGeminiModel: async (model) => {
    set({ geminiModel: model })
    await window.api.settings.set('geminiModel', model)
  },

  setAnthropicModel: async (model) => {
    set({ anthropicModel: model })
    await window.api.settings.set('anthropicModel', model)
  },

  setApiKey: async (provider, key) => {
    await window.api.apiKeys.setKey(provider, key)
    set({ apiKeyStatus: { ...get().apiKeyStatus, [provider]: key.trim() !== '' } })
  },

  refreshApiKeyStatus: async () => {
    const status = await window.api.apiKeys.getStatus()
    set({ apiKeyStatus: status })
  },

  setSidebarOrder: async (order) => {
    set({ sidebarOrder: order })
    await window.api.settings.set('sidebarOrder', JSON.stringify(order))
  },

  toggleAccountCollapsed: async (accountId) => {
    const current = get().collapsedAccountIds
    const next = current.includes(accountId) ? current.filter((id) => id !== accountId) : [...current, accountId]
    set({ collapsedAccountIds: next })
    await window.api.settings.set('collapsedAccountIds', JSON.stringify(next))
  }
}))
