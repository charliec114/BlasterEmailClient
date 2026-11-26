export function textToEditorHtml(text: string): string {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML.replace(/\n/g, '<br>')
}

export function htmlToPlainText(html: string): string {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  div.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  div.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, blockquote').forEach((el) => {
    el.append('\n')
  })
  return (div.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Limpia el HTML de un mail recibido para meterlo dentro del editor (contentEditable):
// saca scripts/estilos/embebidos y atributos on*, para que no se ejecute nada al citarlo.
export function sanitizeQuotedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, link, meta, title, iframe, object, embed, form, base').forEach((el) => el.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value))) {
        el.removeAttribute(attr.name)
      }
    }
  })
  return doc.body.innerHTML
}

// Estilo Gmail: línea "El <fecha>, Nombre <email> escribió:" y el mensaje original dentro de
// un blockquote con borde a la izquierda, en lugar de prefijar cada línea con "> ".
export function buildQuotedReplyHtml(header: string, bodyHtml: string | undefined, bodyText: string): string {
  const inner = bodyHtml?.trim() ? sanitizeQuotedHtml(bodyHtml) : textToEditorHtml(bodyText)
  return (
    `<div><br></div><div><br></div>` +
    `<div class="gmail_quote"><div class="gmail_attr">${escapeHtml(header)}<br></div>` +
    `<blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">${inner}</blockquote></div>`
  )
}
