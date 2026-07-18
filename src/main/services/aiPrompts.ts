export function styleBlock(stylePrompt: string): string {
  return stylePrompt.trim() ? `Instrucción de estilo a respetar siempre: ${stylePrompt.trim()}\n\n` : ''
}

export function stripMetaCommentary(text: string): string {
  return text
    .trim()
    .replace(/\n*\(?\s*(nota|note|aclaraci[oó]n)\s*:.*$/is, '')
    .replace(/^(aquí|acá)\s+(te|les)?\s*(presento|dejo|comparto|va|tenés|tienes)\s+.*?resumen[^:\n]*:\s*/i, '')
    .replace(/^resumen\s*:\s*/i, '')
    .trim()
}

export function cleanupSubject(text: string): string {
  return stripMetaCommentary(text)
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/^asunto\s*:\s*/i, '')
    .split('\n')[0]
    .trim()
}

export function summarizePrompt(stylePrompt: string, threadText: string): string {
  return `${styleBlock(stylePrompt)}Resumí la siguiente conversación de email en español, en 2 a 4 oraciones, destacando decisiones tomadas y pendientes. No hace falta repetir quién escribió cada mensaje si no es relevante.

Reglas estrictas:
- Devolvé ÚNICAMENTE el resumen en sí, sin ninguna frase introductoria como "Aquí tienes un resumen" o similar.
- No agregues comentarios, notas ni aclaraciones sobre las instrucciones que seguiste.

Conversación:
${threadText}

Resumen:`
}

export function composePrompt(stylePrompt: string, instruction: string, context: string, currentBody: string): string {
  const contextBlock = context.trim() ? `Contexto de la conversación:\n${context.trim()}\n\n` : ''
  const bodyBlock = currentBody.trim() ? `Borrador actual del usuario:\n${currentBody.trim()}\n\n` : ''

  return `${styleBlock(stylePrompt)}${contextBlock}${bodyBlock}Tarea: ${instruction}

Reglas estrictas:
- Devolvé ÚNICAMENTE el texto final del cuerpo del email, listo para pegar y enviar tal cual.
- No incluyas asunto, firma, saludos tipo "Aquí tienes", ni ningún comentario, nota o aclaración sobre las instrucciones que seguiste.
- No agregues nada antes o después del email (nada entre paréntesis, nada de "Nota:", nada de explicaciones).

Email:`
}

export function subjectPrompt(stylePrompt: string, context: string, body: string): string {
  const contextBlock = context.trim() ? `Contexto de la conversación:\n${context.trim()}\n\n` : ''
  const bodyBlock = body.trim() ? `Cuerpo del email:\n${body.trim()}\n\n` : ''

  return `${styleBlock(stylePrompt)}${contextBlock}${bodyBlock}Tarea: generá un asunto de email breve y descriptivo, en español, de no más de 8 palabras.

Reglas estrictas:
- Devolvé ÚNICAMENTE el asunto, en una sola línea.
- No incluyas comillas, la palabra "Asunto:", ni ningún comentario o aclaración.

Asunto:`
}
