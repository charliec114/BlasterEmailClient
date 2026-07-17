import { useSettingsStore, type Language } from '../store/useSettingsStore'
import { translations, type TranslationKey } from './translations'

const LOCALES: Record<Language, string> = {
  es: 'es-AR',
  en: 'en-US'
}

export function localeFor(language: Language): string {
  return LOCALES[language]
}

export function translate(language: Language, key: TranslationKey, params?: Record<string, string>): string {
  const template = translations[language][key] ?? translations.es[key]
  if (!params) return template
  return Object.entries(params).reduce((acc, [name, value]) => acc.replaceAll(`{{${name}}}`, value), template)
}

export function useT(): {
  t: (key: TranslationKey, params?: Record<string, string>) => string
  language: Language
  locale: string
} {
  const language = useSettingsStore((s) => s.language)
  return {
    t: (key, params) => translate(language, key, params),
    language,
    locale: localeFor(language)
  }
}
