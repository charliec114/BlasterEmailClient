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
