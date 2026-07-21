import { useEffect, useRef, useState } from 'react'
import { useMailStore, UNIFIED_INBOX_ID } from '../store/useMailStore'
import { useMailDataStore } from '../store/useMailDataStore'
import { useAccountStore } from '../store/useAccountStore'
import { useComposeStore } from '../store/useComposeStore'
import { useT } from '../i18n/useT'

const SEARCH_DEBOUNCE_MS = 300

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

  function formatListDate(iso: string): string {
    const date = new Date(iso)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    return isToday
      ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString(locale, { day: '2-digit', month: 'short' })
  }

  const threads = isSearching ? searchResults : isUnified ? unifiedInboxThreads : threadsByFolder[selectedFolderId ?? ''] ?? []
  const showAccountBorder = isUnified || isSearching
  const composeAccountId = selectedAccountId ?? accounts[0]?.id ?? null

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

      <ul>
        {isSearching && searching && <li className="message-list-empty">{t('common.loading')}</li>}
        {threads.map((thread) => (
          <li key={thread.id}>
            <button
              className={`message-row ${thread.id === selectedThreadId ? 'active' : ''} ${thread.hasUnread ? 'unread' : ''}`}
              style={showAccountBorder ? { borderLeft: `4px solid ${accounts.find((a) => a.id === thread.accountId)?.color ?? 'transparent'}` } : undefined}
              onClick={() => selectThread(thread.id)}
            >
              <div className="message-row-top">
                <span className="message-participants">{thread.participants.map((p) => p.name).join(', ')}</span>
                <span className="message-date">{formatListDate(thread.lastMessageDate)}</span>
              </div>
              <div className="message-row-subject">
                {thread.hasUnread && <span className="unread-dot" />}
                {thread.subject}
                {thread.messages.length > 1 && (
                  <span className="thread-count">{thread.messages.length}</span>
                )}
                {thread.isFlagged && <span className="flag-icon">🚩</span>}
              </div>
              <div className="message-row-snippet">{thread.snippet}</div>
            </button>
          </li>
        ))}
        {!searching && threads.length === 0 && (
          <li className="message-list-empty">
            {isSearching ? t('messageList.noSearchResults') : t('messageList.noConversations')}
          </li>
        )}
      </ul>
    </section>
  )
}
