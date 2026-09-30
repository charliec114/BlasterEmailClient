import { create } from 'zustand'
import type { UpdateCheckResult } from '@shared/types'

export type ThemePreference = 'light' | 'dark' | 'system'
export type Language = 'es' | 'en'

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  // Los errores de IPC llegan como "Error invoking remote method 'x': Error: <mensaje real>".
  return message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')
}

interface SettingsStore {
  theme: ThemePreference
  language: Language
  soundEnabled: boolean
  notificationsEnabled: boolean
  loaded: boolean
  appVersion: string
  updateInfo: UpdateCheckResult | null
  checkingUpdate: boolean
  updateError: string | null
  aiStylePrompt: string
  aiBaseUrl: string
  aiModel: string
  aiModels: string[]
  aiModelsError: string | null
  aiLoadingModels: boolean
  apiKeyStatus: Record<string, boolean>
  sidebarOrder: string[]
  collapsedAccountIds: string[]
  loadSettings: () => Promise<void>
  setTheme: (theme: ThemePreference) => Promise<void>
  setLanguage: (language: Language) => Promise<void>
  setSoundEnabled: (enabled: boolean) => Promise<void>
  setNotificationsEnabled: (enabled: boolean) => Promise<void>
  loadAppVersion: () => Promise<void>
  checkForUpdate: () => Promise<void>
  setAiStylePrompt: (stylePrompt: string) => Promise<void>
  setAiBaseUrl: (baseUrl: string) => Promise<void>
  setAiModel: (model: string) => Promise<void>
  refreshAiModels: () => Promise<void>
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
  notificationsEnabled: true,
  loaded: false,
  appVersion: '',
  updateInfo: null,
  checkingUpdate: false,
  updateError: null,
  aiStylePrompt: '',
  aiBaseUrl: '',
  aiModel: '',
  aiModels: [],
  aiModelsError: null,
  aiLoadingModels: false,
  apiKeyStatus: {},
  sidebarOrder: [],
  collapsedAccountIds: [],

  loadSettings: async () => {
    const all = await window.api.settings.getAll()
    const theme = (all.theme as ThemePreference | undefined) ?? 'system'
    const soundEnabled = all.soundEnabled !== 'false'
    const notificationsEnabled = all.notificationsEnabled !== 'false'
    applyTheme(theme)
    const language = (all.language as Language | undefined) ?? 'es'
    set({
      theme,
      language,
      soundEnabled,
      notificationsEnabled,
      loaded: true,
      aiStylePrompt: all.aiStylePrompt || '',
      aiBaseUrl: all.aiBaseUrl || '',
      aiModel: all.aiModel || '',
      sidebarOrder: parseJsonArray(all.sidebarOrder),
      collapsedAccountIds: parseJsonArray(all.collapsedAccountIds)
    })
    get().refreshApiKeyStatus().then(() => get().refreshAiModels())
    get().loadAppVersion()
    get().checkForUpdate()
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

  setNotificationsEnabled: async (enabled) => {
    set({ notificationsEnabled: enabled })
    await window.api.settings.set('notificationsEnabled', String(enabled))
  },

  loadAppVersion: async () => {
    const version = await window.api.app.getVersion()
    set({ appVersion: version })
  },

  checkForUpdate: async () => {
    set({ checkingUpdate: true, updateError: null })
    try {
      const info = await window.api.updates.checkLatest()
      set({ updateInfo: info, checkingUpdate: false })
    } catch (error) {
      set({ updateError: errorMessage(error), checkingUpdate: false })
    }
  },

  setAiStylePrompt: async (stylePrompt) => {
    set({ aiStylePrompt: stylePrompt })
    await window.api.settings.set('aiStylePrompt', stylePrompt)
  },

  setAiBaseUrl: async (baseUrl) => {
    set({ aiBaseUrl: baseUrl })
    await window.api.settings.set('aiBaseUrl', baseUrl)
  },

  setAiModel: async (model) => {
    set({ aiModel: model })
    await window.api.settings.set('aiModel', model)
  },

  // Consulta /models de la API configurada para sugerir modelos; si el proveedor no lo expone
  // (o falla la conexión) el campo de modelo sigue siendo de texto libre.
  refreshAiModels: async () => {
    const baseUrl = get().aiBaseUrl.trim()
    if (!baseUrl) {
      set({ aiModels: [], aiModelsError: null, aiLoadingModels: false })
      return
    }
    set({ aiLoadingModels: true, aiModelsError: null })
    try {
      const models = await window.api.ai.listModels(baseUrl)
      set({ aiModels: models, aiLoadingModels: false })
    } catch (error) {
      set({ aiModels: [], aiModelsError: errorMessage(error), aiLoadingModels: false })
    }
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
