// Referencia copiable a un hilo: la pega el usuario en el chat de la IA conectada al servidor
// MCP ("mirá este hilo: blaster-thread:...") y la IA se la pasa a get_thread. Es un base64url
// de [accountId, threadKey] porque las thread keys pueden traer caracteres como <, > o @.
const PREFIX = 'blaster-thread:'

export function encodeThreadRef(accountId: string, threadId: string): string {
  const bytes = new TextEncoder().encode(JSON.stringify([accountId, threadId]))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return PREFIX + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeThreadRef(ref: string): { accountId: string; threadId: string } | null {
  const trimmed = ref.trim()
  if (!trimmed.startsWith(PREFIX)) return null
  try {
    const base64 = trimmed.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64)
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))))
    if (Array.isArray(parsed) && typeof parsed[0] === 'string' && typeof parsed[1] === 'string') {
      return { accountId: parsed[0], threadId: parsed[1] }
    }
  } catch {
    // referencia mal copiada: se informa como inválida más abajo
  }
  return null
}
