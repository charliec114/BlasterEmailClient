import { AI_SYSTEM_PROMPT, composePrompt, cleanupSubject, stripMetaCommentary, subjectPrompt, summarizePrompt } from './aiPrompts'

export interface OllamaSettings {
  baseUrl: string
  model: string
  stylePrompt: string
}

interface TagsResponse {
  models?: { name: string }[]
}

interface GenerateResponse {
  response?: string
}

export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`)
  if (!res.ok) {
    throw new Error(`Ollama respondió ${res.status}`)
  }
  const data = (await res.json()) as TagsResponse
  return (data.models ?? []).map((m) => m.name)
}

async function generate(baseUrl: string, model: string, prompt: string): Promise<string> {
  if (!model) {
    throw new Error('No hay un modelo de Ollama seleccionado. Configuralo en Ajustes.')
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, system: AI_SYSTEM_PROMPT, stream: false })
  })

  if (!res.ok) {
    throw new Error(`Ollama respondió ${res.status}`)
  }

  const data = (await res.json()) as GenerateResponse
  return (data.response ?? '').trim()
}

export async function summarizeThread(settings: OllamaSettings, threadText: string): Promise<string> {
  const result = await generate(settings.baseUrl, settings.model, summarizePrompt(settings.stylePrompt, threadText))
  return stripMetaCommentary(result)
}

export async function assistCompose(
  settings: OllamaSettings,
  instruction: string,
  context: string,
  currentBody: string
): Promise<string> {
  const result = await generate(
    settings.baseUrl,
    settings.model,
    composePrompt(settings.stylePrompt, instruction, context, currentBody)
  )
  return stripMetaCommentary(result)
}

export async function suggestSubject(settings: OllamaSettings, context: string, body: string): Promise<string> {
  if (!context.trim() && !body.trim()) {
    throw new Error('Escribí algo en el cuerpo para poder sugerir un asunto.')
  }
  const result = await generate(settings.baseUrl, settings.model, subjectPrompt(settings.stylePrompt, context, body))
  return cleanupSubject(result)
}
