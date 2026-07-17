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
  loadSettings: () => Promise<void>
  setTheme: (theme: ThemePreference) => Promise<void>
  setLanguage: (language: Language) => Promise<void>
  setSoundEnabled: (enabled: boolean) => Promise<void>
  setOllamaBaseUrl: (baseUrl: string) => Promise<void>
  setOllamaModel: (model: string) => Promise<void>
  setOllamaStylePrompt: (stylePrompt: string) => Promise<void>
  refreshOllamaModels: () => Promise<void>
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
      ollamaStylePrompt: all.ollamaStylePrompt || ''
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
  }
}))
