const MAX_ATTACHMENT_CHARS = 4000

const TEXT_EXTENSIONS = ['txt', 'csv', 'md', 'json', 'log']

function extensionOf(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

// Se usa para armar el contexto del RAG de "Pendientes": convertimos los adjuntos más
// comunes (PDF y texto plano) a texto de antemano así el modelo los puede leer como
// parte de la conversación, en vez de ignorarlos. Formatos sin extractor (docx, xlsx,
// imágenes, etc.) quedan solo referenciados por nombre.
export async function extractAttachmentText(
  filename: string,
  contentType: string | null,
  content: Buffer
): Promise<string | null> {
  const ext = extensionOf(filename)

  if (contentType?.includes('pdf') || ext === 'pdf') {
    try {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: content })
      const result = await parser.getText()
      await parser.destroy()
      const text = result.text.trim()
      return text ? text.slice(0, MAX_ATTACHMENT_CHARS) : null
    } catch {
      return null
    }
  }

  if (contentType?.startsWith('text/') || TEXT_EXTENSIONS.includes(ext)) {
    const text = content.toString('utf-8').trim()
    return text ? text.slice(0, MAX_ATTACHMENT_CHARS) : null
  }

  return null
}
