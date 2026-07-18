import { create } from 'zustand'

export type ThemePreference = 'light' | 'dark' | 'system'
export type Language = 'es' | 'en'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface SettingsStore {
  theme: ThemePreference
  language: Language
  soundEnabled: boolean
  loaded: boolean
  ollamaBaseUrl: string
  ollamaModel: string
  ollamaStylePrompt: string
  ollamaModels: string[]
  ollamaError: string | null
  ollamaLoadingModels: boolean
  sidebarOrder: string[]
  collapsedAccountIds: string[]
  loadSettings: () => Promise<void>
  setTheme: (theme: ThemePreference) => Promise<void>
  setLanguage: (language: Language) => Promise<void>
  setSoundEnabled: (enabled: boolean) => Promise<void>
  setOllamaBaseUrl: (baseUrl: string) => Promise<void>
  setOllamaModel: (model: string) => Promise<void>
  setOllamaStylePrompt: (stylePrompt: string) => Promise<void>
  refreshOllamaModels: () => Promise<void>
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
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: '',
  ollamaStylePrompt: '',
  ollamaModels: [],
  ollamaError: null,
  ollamaLoadingModels: false,
  sidebarOrder: [],
  collapsedAccountIds: [],

  loadSettings: async () => {
    const all = await window.api.settings.getAll()
    const theme = (all.theme as ThemePreference | undefined) ?? 'system'
    const soundEnabled = all.soundEnabled !== 'false'
    applyTheme(theme)
    const language = (all.language as Language | undefined) ?? 'es'
    set({
      theme,
      language,
      soundEnabled,
      loaded: true,
      ollamaBaseUrl: all.ollamaBaseUrl || 'http://localhost:11434',
      ollamaModel: all.ollamaModel || '',
      ollamaStylePrompt: all.ollamaStylePrompt || '',
      sidebarOrder: parseJsonArray(all.sidebarOrder),
      collapsedAccountIds: parseJsonArray(all.collapsedAccountIds)
    })
    get().refreshOllamaModels()
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

  setOllamaBaseUrl: async (baseUrl) => {
    set({ ollamaBaseUrl: baseUrl })
    await window.api.settings.set('ollamaBaseUrl', baseUrl)
  },

  setOllamaModel: async (model) => {
    set({ ollamaModel: model })
    await window.api.settings.set('ollamaModel', model)
  },

  setOllamaStylePrompt: async (stylePrompt) => {
    set({ ollamaStylePrompt: stylePrompt })
    await window.api.settings.set('ollamaStylePrompt', stylePrompt)
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
