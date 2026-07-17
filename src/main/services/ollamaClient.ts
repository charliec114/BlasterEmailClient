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
    body: JSON.stringify({ model, prompt, stream: false })
  })

  if (!res.ok) {
    throw new Error(`Ollama respondió ${res.status}`)
  }

  const data = (await res.json()) as GenerateResponse
  return (data.response ?? '').trim()
}

function styleBlock(stylePrompt: string): string {
  return stylePrompt.trim() ? `Instrucción de estilo a respetar siempre: ${stylePrompt.trim()}\n\n` : ''
}

function stripMetaCommentary(text: string): string {
  return text
    .trim()
    .replace(/\n*\(?\s*(nota|note|aclaraci[oó]n)\s*:.*$/is, '')
    .trim()
}

export async function summarizeThread(settings: OllamaSettings, threadText: string): Promise<string> {
  const prompt = `${styleBlock(settings.stylePrompt)}Resumí la siguiente conversación de email en español, en 2 a 4 oraciones, destacando decisiones tomadas y pendientes. No hace falta repetir quién escribió cada mensaje si no es relevante.

Conversación:
${threadText}

Resumen:`

  return generate(settings.baseUrl, settings.model, prompt)
}

export async function assistCompose(
  settings: OllamaSettings,
  instruction: string,
  context: string,
  currentBody: string
): Promise<string> {
  const contextBlock = context.trim() ? `Contexto de la conversación:\n${context.trim()}\n\n` : ''
  const bodyBlock = currentBody.trim() ? `Borrador actual del usuario:\n${currentBody.trim()}\n\n` : ''

  const prompt = `${styleBlock(settings.stylePrompt)}${contextBlock}${bodyBlock}Tarea: ${instruction}

Reglas estrictas:
- Devolvé ÚNICAMENTE el texto final del cuerpo del email, listo para pegar y enviar tal cual.
- No incluyas asunto, firma, saludos tipo "Aquí tienes", ni ningún comentario, nota o aclaración sobre las instrucciones que seguiste.
- No agregues nada antes o después del email (nada entre paréntesis, nada de "Nota:", nada de explicaciones).

Email:`

  const result = await generate(settings.baseUrl, settings.model, prompt)
  return stripMetaCommentary(result)
}

function cleanupSubject(text: string): string {
  return stripMetaCommentary(text)
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/^asunto\s*:\s*/i, '')
    .split('\n')[0]
    .trim()
}

export async function suggestSubject(settings: OllamaSettings, context: string, body: string): Promise<string> {
  const contextBlock = context.trim() ? `Contexto de la conversación:\n${context.trim()}\n\n` : ''
  const bodyBlock = body.trim() ? `Cuerpo del email:\n${body.trim()}\n\n` : ''

  if (!contextBlock && !bodyBlock) {
    throw new Error('Escribí algo en el cuerpo para poder sugerir un asunto.')
  }

  const prompt = `${styleBlock(settings.stylePrompt)}${contextBlock}${bodyBlock}Tarea: generá un asunto de email breve y descriptivo, en español, de no más de 8 palabras.

Reglas estrictas:
- Devolvé ÚNICAMENTE el asunto, en una sola línea.
- No incluyas comillas, la palabra "Asunto:", ni ningún comentario o aclaración.

Asunto:`

  const result = await generate(settings.baseUrl, settings.model, prompt)
  return cleanupSubject(result)
}
