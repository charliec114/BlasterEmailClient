import { useRef } from 'react'

const INJECTED_HEAD = `
  <base target="_blank">
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data: blob:; style-src 'unsafe-inline'">
  <style>
    /* html con overflow != visible "rompe" la propagación del scroll al viewport (regla del
       spec de CSSOM-View): así el scroll horizontal pasa a vivir en el body como un elemento
       normal, en vez del viewport raíz — que en Chromium/Linux a veces pinta con el scrollbar
       nativo del sistema en lugar de respetar ::-webkit-scrollbar. */
    html { overflow: hidden; margin: 0; background: #e9e9ea; }
    body { overflow-x: auto; overflow-y: hidden; background: #e9e9ea; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; line-height: 1.5; margin: 0; padding: 12px; word-wrap: break-word; }
    img { max-width: 100%; }
    summary { cursor: pointer; color: #0a84ff; font-size: 12px; margin: 10px 0 6px; }
    details[open] summary { margin-bottom: 10px; }
    blockquote { border-left: 2px solid #c7c7cc; margin: 4px 0; padding-left: 10px; color: #55555a; }
    * { scrollbar-width: thin; scrollbar-color: #c7c7cc transparent; }
    *::-webkit-scrollbar { width: 10px; height: 10px; }
    *::-webkit-scrollbar-track { background: transparent; }
    *::-webkit-scrollbar-thumb { background-color: #c7c7cc; border-radius: 6px; border: 2px solid transparent; background-clip: content-box; }
    *::-webkit-scrollbar-thumb:hover { background-color: #a8a8ad; }
  </style>
`

const QUOTE_SELECTORS = ['blockquote', '.gmail_quote', '.yahoo_quoted', '.moz-cite-prefix', '#mail-editor-reference-message-container']
const QUOTE_HEADER_PATTERN = /(escribió|wrote|schrieb|a écrit)\s*:?\s*$/i

function collapseQuotedHtml(rawHtml: string): string {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html')

  let quoteEl: Element | null = null
  for (const selector of QUOTE_SELECTORS) {
    quoteEl = doc.querySelector(selector)
    if (quoteEl) break
  }
  if (!quoteEl) return rawHtml

  let startEl = quoteEl
  const prev = quoteEl.previousElementSibling
  if (prev && QUOTE_HEADER_PATTERN.test(prev.textContent?.trim() ?? '')) {
    startEl = prev
  }

  const parent = startEl.parentElement
  if (!parent) return rawHtml

  const details = doc.createElement('details')
  const summary = doc.createElement('summary')
  summary.textContent = 'Mostrar texto completo'
  details.appendChild(summary)

  const toMove: Element[] = []
  for (let node: Element | null = startEl; node; node = node.nextElementSibling) {
    toMove.push(node)
  }
  toMove.forEach((el) => details.appendChild(el))
  parent.appendChild(details)

  return doc.documentElement.outerHTML
}

function wrapEmailHtml(rawHtml: string): string {
  if (/<head[^>]*>/i.test(rawHtml)) {
    return rawHtml.replace(/<head[^>]*>/i, (match) => `${match}${INJECTED_HEAD}`)
  }
  if (/<html[^>]*>/i.test(rawHtml)) {
    return rawHtml.replace(/<html[^>]*>/i, (match) => `${match}<head>${INJECTED_HEAD}</head>`)
  }
  return `<!doctype html><html><head>${INJECTED_HEAD}</head><body>${rawHtml}</body></html>`
}

interface EmailBodyFrameProps {
  html: string
}

export default function EmailBodyFrame({ html }: EmailBodyFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  function handleLoad(): void {
    const doc = iframeRef.current?.contentWindow?.document
    if (!doc) return
    iframeRef.current!.style.height = `${doc.documentElement.scrollHeight}px`
  }

  return (
    <div className="email-body-frame-wrapper">
      <iframe
        ref={iframeRef}
        className="email-body-frame"
        sandbox="allow-same-origin allow-popups"
        srcDoc={wrapEmailHtml(collapseQuotedHtml(html))}
        onLoad={handleLoad}
        title="Contenido del email"
      />
    </div>
  )
}
