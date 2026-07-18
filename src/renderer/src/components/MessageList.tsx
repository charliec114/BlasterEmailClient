import { useEffect } from 'react'
import { useMailStore, UNIFIED_INBOX_ID } from '../store/useMailStore'
import { useMailDataStore } from '../store/useMailDataStore'
import { useAccountStore } from '../store/useAccountStore'
import { useComposeStore } from '../store/useComposeStore'
import { useT } from '../i18n/useT'

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
  const fetchThreads = useMailDataStore((s) => s.fetchThreads)
  const fetchUnifiedInbox = useMailDataStore((s) => s.fetchUnifiedInbox)
  const openCompose = useComposeStore((s) => s.openCompose)
  const accounts = useAccountStore((s) => s.accounts)

  useEffect(() => {
    if (isUnified) fetchUnifiedInbox()
    else if (selectedAccountId && selectedFolderId) fetchThreads(selectedAccountId, selectedFolderId)
  }, [isUnified, selectedAccountId, selectedFolderId, fetchThreads, fetchUnifiedInbox])

  function formatListDate(iso: string): string {
    const date = new Date(iso)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    return isToday
      ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString(locale, { day: '2-digit', month: 'short' })
  }

  const threads = isUnified ? unifiedInboxThreads : threadsByFolder[selectedFolderId ?? ''] ?? []

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
                  {isUnified && (
                    <span
                      className="message-account-dot"
                      style={{ backgroundColor: accounts.find((a) => a.id === thread.accountId)?.color }}
                    />
                  )}
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
