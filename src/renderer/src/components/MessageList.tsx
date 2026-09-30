import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useMailStore, UNIFIED_INBOX_ID } from '../store/useMailStore'
import { useMailDataStore } from '../store/useMailDataStore'
import { useAccountStore } from '../store/useAccountStore'
import { useComposeStore } from '../store/useComposeStore'
import { useT } from '../i18n/useT'
import type { Thread } from '@shared/types'

const SEARCH_DEBOUNCE_MS = 300
// Debe coincidir con la altura fija de .message-row en global.css. La lista renderiza sólo las
// filas visibles (+ overscan): una carpeta puede tener miles de hilos y montar un botón por
// cada uno hacía lento cada refresco y cada scroll.
const ROW_HEIGHT = 72
const OVERSCAN = 8

function formatListDate(iso: string, locale: string): string {
  const date = new Date(iso)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  return isToday
    ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(locale, { day: '2-digit', month: 'short' })
}

interface MessageRowProps {
  thread: Thread
  active: boolean
  borderColor: string | undefined
  locale: string
  onSelect: (threadId: string) => void
}

const MessageRow = memo(function MessageRow({ thread, active, borderColor, locale, onSelect }: MessageRowProps) {
  return (
    <li>
      <button
        className={`message-row ${active ? 'active' : ''} ${thread.hasUnread ? 'unread' : ''}`}
        style={borderColor ? { borderLeft: `4px solid ${borderColor}` } : undefined}
        onClick={() => onSelect(thread.id)}
      >
        <div className="message-row-top">
          <span className="message-participants">{thread.participants.map((p) => p.name).join(', ')}</span>
          <span className="message-date">{formatListDate(thread.lastMessageDate, locale)}</span>
        </div>
        <div className="message-row-subject">
          {thread.hasUnread && <span className="unread-dot" />}
          {thread.subject}
          {thread.messages.length > 1 && <span className="thread-count">{thread.messages.length}</span>}
          {thread.isFlagged && <span className="flag-icon">🚩</span>}
        </div>
        <div className="message-row-snippet">{thread.snippet}</div>
      </button>
    </li>
  )
})

export default function MessageList() {
  const { t, locale } = useT()
  const selectedAccountId = useMailStore((s) => s.selectedAccountId)
  const selectedFolderId = useMailStore((s) => s.selectedFolderId)
  const selectedFolderName = useMailStore((s) => s.selectedFolderName)
  const selectedThreadId = useMailStore((s) => s.selectedThreadId)
  const selectThread = useMailStore((s) => s.selectThread)

  const isUnified = selectedFolderId === UNIFIED_INBOX_ID
  const threadsByFolder = useMailDataStore((s) => s.threadsByFolder)
  const unifiedInboxThreads = useMailDataStore((s) => s.unifiedInboxThreads)
  const searchQuery = useMailDataStore((s) => s.searchQuery)
  const searchResults = useMailDataStore((s) => s.searchResults)
  const searching = useMailDataStore((s) => s.searching)
  const search = useMailDataStore((s) => s.search)
  const clearSearch = useMailDataStore((s) => s.clearSearch)
  const fetchThreads = useMailDataStore((s) => s.fetchThreads)
  const fetchUnifiedInbox = useMailDataStore((s) => s.fetchUnifiedInbox)
  const openCompose = useComposeStore((s) => s.openCompose)
  const accounts = useAccountStore((s) => s.accounts)

  const [searchInput, setSearchInput] = useState(searchQuery)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSearching = searchQuery.trim() !== ''

  useEffect(() => {
    if (isUnified) fetchUnifiedInbox()
    else if (selectedAccountId && selectedFolderId) fetchThreads(selectedAccountId, selectedFolderId)
  }, [isUnified, selectedAccountId, selectedFolderId, fetchThreads, fetchUnifiedInbox])

  // El buscador puede activarse desde afuera (ej: un link a un hilo desde el Asistente),
  // así que el input visible tiene que reflejar el searchQuery del store, no solo lo que
  // se tipeó acá.
  useEffect(() => {
    setSearchInput(searchQuery)
  }, [searchQuery])

  function handleSearchInput(value: string): void {
    setSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), SEARCH_DEBOUNCE_MS)
  }

  function handleClearSearch(): void {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSearchInput('')
    clearSearch()
  }

  const threads = isSearching ? searchResults : isUnified ? unifiedInboxThreads : threadsByFolder[selectedFolderId ?? ''] ?? []
  const showAccountBorder = isUnified || isSearching
  const composeAccountId = selectedAccountId ?? accounts[0]?.id ?? null
  const accountColorById = useMemo(() => new Map(accounts.map((a) => [a.id, a.color])), [accounts])

  const scrollRef = useRef<HTMLDivElement>(null)
  const [firstVisibleRow, setFirstVisibleRow] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(800)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setViewportHeight(el.clientHeight)
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Al cambiar de carpeta/búsqueda la lista arranca desde arriba.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    setFirstVisibleRow(0)
  }, [selectedFolderId, isSearching])

  const startRow = Math.max(0, firstVisibleRow - OVERSCAN)
  const endRow = Math.min(threads.length, firstVisibleRow + Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN)
  const visibleThreads = threads.slice(startRow, endRow)

  return (
    <section className="message-list">
      <div className="message-list-header">
        <span>{isSearching ? t('messageList.searchResultsFor', { query: searchInput }) : selectedFolderName ?? t('messageList.noFolderSelected')}</span>
        <button
          type="button"
          className="new-message-btn"
          disabled={!composeAccountId}
          onClick={() => composeAccountId && openCompose({ accountId: composeAccountId })}
        >
          {t('messageList.newMessage')}
        </button>
      </div>

      <div className="message-list-search">
        <span className="search-icon">🔎</span>
        <input
          value={searchInput}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder={t('messageList.searchPlaceholder')}
        />
        {searchInput && (
          <button type="button" className="search-clear-btn" title={t('common.close')} onClick={handleClearSearch}>
            ✕
          </button>
        )}
      </div>

      <div
        className="message-list-scroll"
        ref={scrollRef}
        onScroll={(e) => setFirstVisibleRow(Math.floor(e.currentTarget.scrollTop / ROW_HEIGHT))}
      >
        {isSearching && searching && <div className="message-list-empty">{t('common.loading')}</div>}
        <ul style={{ paddingTop: startRow * ROW_HEIGHT, paddingBottom: (threads.length - endRow) * ROW_HEIGHT }}>
          {visibleThreads.map((thread) => (
            <MessageRow
              key={thread.id}
              thread={thread}
              active={thread.id === selectedThreadId}
              borderColor={showAccountBorder ? accountColorById.get(thread.accountId) ?? 'transparent' : undefined}
              locale={locale}
              onSelect={selectThread}
            />
          ))}
        </ul>
        {!searching && threads.length === 0 && (
          <div className="message-list-empty">
            {isSearching ? t('messageList.noSearchResults') : t('messageList.noConversations')}
          </div>
        )}
      </div>
    </section>
  )
}
