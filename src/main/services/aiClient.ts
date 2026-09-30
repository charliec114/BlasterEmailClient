import { AI_SYSTEM_PROMPT, composePrompt, cleanupSubject, stripMetaCommentary, subjectPrompt, summarizePrompt } from './aiPrompts'

// Cliente único para cualquier API compatible con OpenAI (/chat/completions y /models):
// OpenAI, OpenRouter, Ollama, LM Studio, vLLM, y también Gemini y Anthropic vía sus
// endpoints de compatibilidad. `baseUrl` incluye la versión (ej: https://api.openai.com/v1).
export interface AiSettings {
  baseUrl: string
  model: string
  apiKey: string
  stylePrompt: string
}

interface ModelsResponse {
  data?: { id: string }[]
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[]
}

function apiRoot(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

function authHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

// Los proveedores devuelven el motivo del error en el cuerpo ({ error: { message } }); mostrarlo
// evita adivinar si un 401/404/429 es por el token, el modelo o la cuota.
async function describeHttpError(res: Response): Promise<string> {
  let detail = ''
  try {
    const data = (await res.json()) as { error?: { message?: string } | string; message?: string }
    detail = typeof data.error === 'string' ? data.error : (data.error?.message ?? data.message ?? '')
  } catch {
    // cuerpo vacío o no JSON: alcanza con el código
  }
  return `El servidor respondió ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`
}

// La generación (sobre todo local: Ollama, MLX, etc.) puede tardar varios minutos en modelos grandes
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

export async function listAiModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const res = await fetchWithTimeout(
    `${apiRoot(baseUrl)}/models`,
    { headers: authHeaders(apiKey) },
    LIST_MODELS_TIMEOUT_MS
  )
  if (!res.ok) {
    throw new Error(await describeHttpError(res))
  }
  const data = (await res.json()) as ModelsResponse
  return (data.data ?? []).map((m) => m.id)
}

async function generate(settings: AiSettings, prompt: string): Promise<string> {
  if (!settings.model) {
    throw new Error('Configurá el modelo de IA en Ajustes.')
  }
  if (!settings.baseUrl.trim()) {
    throw new Error('Configurá la URL de la API de IA en Ajustes.')
  }

  const res = await fetchWithTimeout(
    `${apiRoot(settings.baseUrl)}/chat/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(settings.apiKey) },
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
    throw new Error(await describeHttpError(res))
  }

  const data = (await res.json()) as ChatCompletionResponse
  return (data.choices?.[0]?.message?.content ?? '').trim()
}

export async function summarizeThread(settings: AiSettings, threadText: string): Promise<string> {
  const result = await generate(settings, summarizePrompt(settings.stylePrompt, threadText))
  return stripMetaCommentary(result)
}

export async function assistCompose(
  settings: AiSettings,
  instruction: string,
  context: string,
  currentBody: string
): Promise<string> {
  const result = await generate(settings, composePrompt(settings.stylePrompt, instruction, context, currentBody))
  return stripMetaCommentary(result)
}

export async function suggestSubject(settings: AiSettings, context: string, body: string): Promise<string> {
  if (!context.trim() && !body.trim()) {
    throw new Error('Escribí algo en el cuerpo para poder sugerir un asunto.')
  }
  const result = await generate(settings, subjectPrompt(settings.stylePrompt, context, body))
  return cleanupSubject(result)
}

export async function answerFreeform(settings: AiSettings, prompt: string): Promise<string> {
  const result = await generate(settings, prompt)
  return stripMetaCommentary(result)
}
