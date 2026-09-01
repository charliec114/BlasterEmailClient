import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, MouseEvent } from 'react'
import { useT } from '../i18n/useT'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  disabled?: boolean
}

interface FormatState {
  bold: boolean
  italic: boolean
  underline: boolean
  insertUnorderedList: boolean
  insertOrderedList: boolean
}

const EMPTY_FORMAT: FormatState = {
  bold: false,
  italic: false,
  underline: false,
  insertUnorderedList: false,
  insertOrderedList: false
}

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24">
      <path d={path} />
    </svg>
  )
}

const ICONS = {
  bold: 'M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z',
  italic: 'M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z',
  underline:
    'M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z',
  bulletList:
    'M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z',
  numberedList:
    'M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z',
  link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
  clearFormat:
    'M6.35 3.94 5.06 5.23l4.42 4.42-1.79 4.18a2.5 2.5 0 0 0 .55 2.77l1.62 1.62a2.5 2.5 0 0 0 3.54 0l1.1-1.1 3.44 3.44 1.29-1.29zM18 5H8.83l6.5 6.5L18 5z'
} as const

export default function RichTextEditor({ value, onChange, placeholder, disabled }: RichTextEditorProps) {
  const { t } = useT()
  const ref = useRef<HTMLDivElement>(null)
  const [format, setFormat] = useState<FormatState>(EMPTY_FORMAT)

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = value
    // Only seed the editor once on mount; the parent remounts this component (via `key`)
    // when it needs to replace the content programmatically (AI assist, undo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateFormatState = useCallback(() => {
    setFormat({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList')
    })
  }, [])

  useEffect(() => {
    document.addEventListener('selectionchange', updateFormatState)
    return () => document.removeEventListener('selectionchange', updateFormatState)
  }, [updateFormatState])

  function emitChange(): void {
    onChange(ref.current?.innerHTML ?? '')
  }

  function exec(command: string, arg?: string): void {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    emitChange()
    updateFormatState()
  }

  function handleClearFormat(): void {
    ref.current?.focus()
    document.execCommand('removeFormat')
    document.execCommand('unlink')
    emitChange()
    updateFormatState()
  }

  function handleLink(): void {
    const url = window.prompt(t('composeModal.rte.linkPrompt'))
    if (!url) return
    exec('createLink', url)
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>): void {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
    emitChange()
  }

  function preventBlur(e: MouseEvent): void {
    e.preventDefault()
  }

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <button
          type="button"
          className={`rte-btn ${format.bold ? 'active' : ''}`}
          title={t('composeModal.rte.bold')}
          disabled={disabled}
          onMouseDown={preventBlur}
          onClick={() => exec('bold')}
        >
          <Icon path={ICONS.bold} />
        </button>
        <button
          type="button"
          className={`rte-btn ${format.italic ? 'active' : ''}`}
          title={t('composeModal.rte.italic')}
          disabled={disabled}
          onMouseDown={preventBlur}
          onClick={() => exec('italic')}
        >
          <Icon path={ICONS.italic} />
        </button>
        <button
          type="button"
          className={`rte-btn ${format.underline ? 'active' : ''}`}
          title={t('composeModal.rte.underline')}
          disabled={disabled}
          onMouseDown={preventBlur}
          onClick={() => exec('underline')}
        >
          <Icon path={ICONS.underline} />
        </button>
        <div className="rte-divider" />
        <button
          type="button"
          className={`rte-btn ${format.insertUnorderedList ? 'active' : ''}`}
          title={t('composeModal.rte.bulletList')}
          disabled={disabled}
          onMouseDown={preventBlur}
          onClick={() => exec('insertUnorderedList')}
        >
          <Icon path={ICONS.bulletList} />
        </button>
        <button
          type="button"
          className={`rte-btn ${format.insertOrderedList ? 'active' : ''}`}
          title={t('composeModal.rte.numberedList')}
          disabled={disabled}
          onMouseDown={preventBlur}
          onClick={() => exec('insertOrderedList')}
        >
          <Icon path={ICONS.numberedList} />
        </button>
        <div className="rte-divider" />
        <button
          type="button"
          className="rte-btn"
          title={t('composeModal.rte.link')}
          disabled={disabled}
          onMouseDown={preventBlur}
          onClick={handleLink}
        >
          <Icon path={ICONS.link} />
        </button>
        <button
          type="button"
          className="rte-btn"
          title={t('composeModal.rte.clearFormat')}
          disabled={disabled}
          onMouseDown={preventBlur}
          onClick={handleClearFormat}
        >
          <Icon path={ICONS.clearFormat} />
        </button>
      </div>
      <div
        ref={ref}
        className="compose-body"
        contentEditable={!disabled}
        data-placeholder={placeholder}
        onInput={emitChange}
        onPaste={handlePaste}
        onMouseUp={updateFormatState}
        onKeyUp={updateFormatState}
        suppressContentEditableWarning
      />
    </div>
  )
}
