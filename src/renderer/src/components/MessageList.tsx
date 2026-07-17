import { useEffect } from 'react'
import { useMailStore } from '../store/useMailStore'
import { useMailDataStore } from '../store/useMailDataStore'
import { useComposeStore } from '../store/useComposeStore'
import { useT } from '../i18n/useT'

export default function MessageList() {
  const { t, locale } = useT()
  const selectedAccountId = useMailStore((s) => s.selectedAccountId)
  const selectedFolderId = useMailStore((s) => s.selectedFolderId)
  const selectedFolderName = useMailStore((s) => s.selectedFolderName)
  const selectedThreadId = useMailStore((s) => s.selectedThreadId)
  const selectThread = useMailStore((s) => s.selectThread)

  const threadsByFolder = useMailDataStore((s) => s.threadsByFolder)
  const fetchThreads = useMailDataStore((s) => s.fetchThreads)
  const openCompose = useComposeStore((s) => s.openCompose)

  useEffect(() => {
    if (selectedAccountId && selectedFolderId) fetchThreads(selectedAccountId, selectedFolderId)
  }, [selectedAccountId, selectedFolderId, fetchThreads])

  function formatListDate(iso: string): string {
    const date = new Date(iso)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    return isToday
      ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString(locale, { day: '2-digit', month: 'short' })
  }

  const threads = threadsByFolder[selectedFolderId ?? ''] ?? []

  return (
    <section className="message-list">
      <div className="message-list-header">
        <span>{selectedFolderName ?? t('messageList.noFolderSelected')}</span>
        <button
          type="button"
          className="new-message-btn"
          disabled={!selectedAccountId}
          onClick={() => selectedAccountId && openCompose({ accountId: selectedAccountId })}
        >
          {t('messageList.newMessage')}
        </button>
      </div>
      <ul>
        {threads.map((thread) => (
          <li key={thread.id}>
            <button
              className={`message-row ${thread.id === selectedThreadId ? 'active' : ''} ${thread.hasUnread ? 'unread' : ''}`}
              onClick={() => selectThread(thread.id)}
            >
              <div className="message-row-top">
                <span className="message-participants">
                  {thread.participants.map((p) => p.name).join(', ')}
                </span>
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
        {threads.length === 0 && <li className="message-list-empty">{t('messageList.noConversations')}</li>}
      </ul>
    </section>
  )
}
