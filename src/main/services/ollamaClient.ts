import { AI_SYSTEM_PROMPT, composePrompt, cleanupSubject, stripMetaCommentary, subjectPrompt, summarizePrompt } from './aiPrompts'

export interface OllamaSettings {
  baseUrl: string
  model: string
  stylePrompt: string
}

interface ModelsResponse {
  data?: { id: string }[]
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[]
}

function apiRoot(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')
}

// La generación local (Ollama, MLX, etc.) puede tardar varios minutos en modelos grandes
// o prompts largos (el digest del Asistente incluye hilos completos) — un timeout corto
// cortaría respuestas válidas a mitad de camino.
const GENERATE_TIMEOUT_MS = 5 * 60_000
const LIST_MODELS_TIMEOUT_MS = 15_000

async function fetchWithTimeout(url: string, init: RequestInit | undefined, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`El servidor no respondió en ${Math.round(timeoutMs / 1000)}s (tiempo de espera agotado)`)
    }
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined
    throw new Error(`No se pudo conectar con ${url}${cause ? ` (${cause})` : ''}`)
  } finally {
    clearTimeout(timer)
  }
}

export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const res = await fetchWithTimeout(`${apiRoot(baseUrl)}/v1/models`, undefined, LIST_MODELS_TIMEOUT_MS)
  if (!res.ok) {
    throw new Error(`El servidor respondió ${res.status}`)
  }
  const data = (await res.json()) as ModelsResponse
  return (data.data ?? []).map((m) => m.id)
}

async function generate(settings: OllamaSettings, prompt: string): Promise<string> {
  if (!settings.model) {
    throw new Error('No hay un modelo seleccionado. Configuralo en Ajustes.')
  }

  const res = await fetchWithTimeout(
    `${apiRoot(settings.baseUrl)}/v1/chat/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        stream: false
      })
    },
    GENERATE_TIMEOUT_MS
  )

  if (!res.ok) {
    throw new Error(`El servidor respondió ${res.status}`)
  }

  const data = (await res.json()) as ChatCompletionResponse
  return (data.choices?.[0]?.message?.content ?? '').trim()
}

export async function summarizeThread(settings: OllamaSettings, threadText: string): Promise<string> {
  const result = await generate(settings, summarizePrompt(settings.stylePrompt, threadText))
  return stripMetaCommentary(result)
}

export async function assistCompose(
  settings: OllamaSettings,
  instruction: string,
  context: string,
  currentBody: string
): Promise<string> {
  const result = await generate(settings, composePrompt(settings.stylePrompt, instruction, context, currentBody))
  return stripMetaCommentary(result)
}

export async function suggestSubject(settings: OllamaSettings, context: string, body: string): Promise<string> {
  if (!context.trim() && !body.trim()) {
    throw new Error('Escribí algo en el cuerpo para poder sugerir un asunto.')
  }
  const result = await generate(settings, subjectPrompt(settings.stylePrompt, context, body))
  return cleanupSubject(result)
}

export async function answerFreeform(settings: OllamaSettings, prompt: string): Promise<string> {
  const result = await generate(settings, prompt)
  return stripMetaCommentary(result)
}
