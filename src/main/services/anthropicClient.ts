import { AI_SYSTEM_PROMPT, composePrompt, cleanupSubject, stripMetaCommentary, subjectPrompt, summarizePrompt } from './aiPrompts'

export interface CloudAiSettings {
  apiKey: string
  model: string
  stylePrompt: string
}

interface MessagesResponse {
  content?: { text?: string }[]
}

async function generate(settings: CloudAiSettings, prompt: string): Promise<string> {
  if (!settings.apiKey) {
    throw new Error('Configurá tu API key de Anthropic en Ajustes.')
  }
  if (!settings.model) {
    throw new Error('Configurá el modelo de Anthropic en Ajustes.')
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 1024,
      system: AI_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!res.ok) {
    throw new Error(`Anthropic respondió ${res.status}`)
  }

  const data = (await res.json()) as MessagesResponse
  return (data.content?.[0]?.text ?? '').trim()
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
