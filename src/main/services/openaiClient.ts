import { AI_SYSTEM_PROMPT, composePrompt, cleanupSubject, stripMetaCommentary, subjectPrompt, summarizePrompt } from './aiPrompts'

export interface CloudAiSettings {
  apiKey: string
  model: string
  stylePrompt: string
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[]
}

async function generate(settings: CloudAiSettings, prompt: string): Promise<string> {
  if (!settings.apiKey) {
    throw new Error('Configurá tu API key de OpenAI en Ajustes.')
  }
  if (!settings.model) {
    throw new Error('Configurá el modelo de OpenAI en Ajustes.')
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]
    })
  })

  if (!res.ok) {
    throw new Error(`OpenAI respondió ${res.status}`)
  }

  const data = (await res.json()) as ChatCompletionResponse
  return (data.choices?.[0]?.message?.content ?? '').trim()
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
