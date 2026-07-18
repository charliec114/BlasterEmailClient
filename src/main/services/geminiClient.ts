import { composePrompt, cleanupSubject, stripMetaCommentary, subjectPrompt, summarizePrompt } from './aiPrompts'

export interface CloudAiSettings {
  apiKey: string
  model: string
  stylePrompt: string
}

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

async function generate(settings: CloudAiSettings, prompt: string): Promise<string> {
  if (!settings.apiKey) {
    throw new Error('Configurá tu API key de Gemini en Ajustes.')
  }
  if (!settings.model) {
    throw new Error('Configurá el modelo de Gemini en Ajustes.')
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent?key=${encodeURIComponent(settings.apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  })

  if (!res.ok) {
    throw new Error(`Gemini respondió ${res.status}`)
  }

  const data = (await res.json()) as GenerateContentResponse
  return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
}

export async function summarizeThread(settings: CloudAiSettings, threadText: string): Promise<string> {
  const result = await generate(settings, summarizePrompt(settings.stylePrompt, threadText))
  return stripMetaCommentary(result)
}

export async function assistCompose(
  settings: CloudAiSettings,
  instruction: string,
  context: string,
  currentBody: string
): Promise<string> {
  const result = await generate(settings, composePrompt(settings.stylePrompt, instruction, context, currentBody))
  return stripMetaCommentary(result)
}

export async function suggestSubject(settings: CloudAiSettings, context: string, body: string): Promise<string> {
  if (!context.trim() && !body.trim()) {
    throw new Error('Escribí algo en el cuerpo para poder sugerir un asunto.')
  }
  const result = await generate(settings, subjectPrompt(settings.stylePrompt, context, body))
  return cleanupSubject(result)
}
