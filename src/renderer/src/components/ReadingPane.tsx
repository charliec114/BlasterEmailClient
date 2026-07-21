import { useEffect, useState } from 'react'
import { useAccountStore } from '../store/useAccountStore'
import { useMailStore, UNIFIED_INBOX_ID } from '../store/useMailStore'
import { useMailDataStore } from '../store/useMailDataStore'
import { useComposeStore } from '../store/useComposeStore'
import MessageBody from './MessageBody'
import ThreadSummaryCard from './ThreadSummaryCard'
import { useT } from '../i18n/useT'
import type { Message, Participant } from '@shared/types'

function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
}

function dedupeExcluding(participants: Participant[], ownEmail: string): Participant[] {
  const seen = new Set<string>()
  const result: Participant[] = []
  for (const p of participants) {
    const key = p.email.toLowerCase()
    if (!p.email || key === ownEmail.toLowerCase() || seen.has(key)) continue
    seen.add(key)
    result.push(p)
  }
  return result
}

export default function ReadingPane() {
  const { t, locale } = useT()
  const accounts = useAccountStore((s) => s.accounts)
  const selectedFolderId = useMailStore((s) => s.selectedFolderId)
  const selectedThreadId = useMailStore((s) => s.selectedThreadId)
  const isUnified = selectedFolderId === UNIFIED_INBOX_ID
  const threadsByFolder = useMailDataStore((s) => s.threadsByFolder)
  const unifiedInboxThreads = useMailDataStore((s) => s.unifiedInboxThreads)
  const searchResults = useMailDataStore((s) => s.searchResults)
  const markThreadRead = useMailDataStore((s) => s.markThreadRead)
  const openCompose = useComposeStore((s) => s.openCompose)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const foundThread =
    (isUnified ? unifiedInboxThreads : threadsByFolder[selectedFolderId ?? ''] ?? []).find((t) => t.id === selectedThreadId) ??
    searchResults.find((t) => t.id === selectedThreadId)

  useEffect(() => {
    if (foundThread && foundThread.hasUnread) {
      markThreadRead(foundThread.accountId, foundThread.folderId, foundThread.id)
    }
  }, [foundThread, markThreadRead])

  if (!foundThread) {
    return (
      <section className="reading-pane reading-pane-empty">
        <p>{t('readingPane.selectConversation')}</p>
      </section>
    )
  }

  const thread = foundThread
  const accountId = thread.accountId

  function formatFullDate(iso: string): string {
    return new Date(iso).toLocaleString(locale, {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const lastMessage: Message = thread.messages[thread.messages.length - 1]
  const ownEmail = accounts.find((a) => a.id === accountId)?.email ?? ''
  const replyAllTo = dedupeExcluding([lastMessage.from, ...lastMessage.to], ownEmail)
  const replyAllCc = dedupeExcluding(lastMessage.cc, ownEmail).filter(
    (p) => !replyAllTo.some((t) => t.email.toLowerCase() === p.email.toLowerCase())
  )
  const showReplyAll = replyAllTo.length + replyAllCc.length > 1

  function toggleExpanded(id: string): void {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function withRePrefix(subject: string): string {
    return /^\s*re\s*:/i.test(subject) ? subject : `Re: ${subject}`
  }

  function withFwdPrefix(subject: string): string {
    return /^\s*fwd\s*:/i.test(subject) ? subject : `Fwd: ${subject}`
  }

  function replyQuoteBody(): string {
    const header = t('readingPane.wroteOn', { date: formatFullDate(lastMessage.date), name: lastMessage.from.name })
    return `\n\n${header}\n${quote(lastMessage.bodyText)}`
  }

  function replyContext(): string {
    return `${lastMessage.from.name}: ${lastMessage.bodyText}`
  }

  function handleReply(): void {
    openCompose({
      accountId,
      to: lastMessage.from.email,
      subject: withRePrefix(thread.subject),
      body: replyQuoteBody(),
      inReplyTo: lastMessage.messageId,
      references: [...lastMessage.references, lastMessage.messageId],
      context: replyContext()
    })
  }

  function handleReplyAll(): void {
    openCompose({
      accountId,
      to: replyAllTo.map((p) => p.email).join(', '),
      cc: replyAllCc.length ? replyAllCc.map((p) => p.email).join(', ') : undefined,
      subject: withRePrefix(thread.subject),
      body: replyQuoteBody(),
      inReplyTo: lastMessage.messageId,
      references: [...lastMessage.references, lastMessage.messageId],
      context: replyContext()
    })
  }

  function handleForward(): void {
    const header = t('readingPane.forwardedHeader')
    const from = t('readingPane.forwardedFrom')
    const dateLabel = t('readingPane.forwardedDate')
    const subjectLabel = t('readingPane.forwardedSubject')
    openCompose({
      accountId,
      to: '',
      subject: withFwdPrefix(thread.subject),
      body: `\n\n${header}\n${from} ${lastMessage.from.name} <${lastMessage.from.email}>\n${dateLabel} ${formatFullDate(lastMessage.date)}\n${subjectLabel} ${thread.subject}\n\n${lastMessage.bodyText}`,
      context: replyContext()
    })
  }

  return (
    <section className="reading-pane">
      <header className="reading-pane-header">
        <h1>{thread.subject}</h1>
        <div className="reading-pane-participants">
          {t('readingPane.participants')} {thread.participants.map((p) => `${p.name} <${p.email}>`).join(', ')}
        </div>
      </header>

      <ThreadSummaryCard key={thread.id} thread={thread} />

      <div className="reading-pane-messages">
        {thread.messages.map((message) => (
          <article key={message.id} className="message-card">
            <div className="message-card-header" onClick={() => toggleExpanded(message.id)}>
              <div className="message-card-avatar">{message.from.name.charAt(0)}</div>
              <div className="message-card-headinfo">
                <div className="message-card-from">
                  {message.from.name}
                  <span className="expand-caret">{expandedIds.has(message.id) ? '▾' : '▸'}</span>
                </div>
                {!expandedIds.has(message.id) && <div className="message-card-date">{formatFullDate(message.date)}</div>}
                {expandedIds.has(message.id) && (
                  <div className="message-card-details" onClick={(e) => e.stopPropagation()}>
                    <div className="message-detail-row">
                      <span className="message-detail-label">{t('readingPane.detailFrom')}</span>
                      <span>
                        {message.from.name} &lt;{message.from.email}&gt;
                      </span>
                    </div>
                    {message.to.length > 0 && (
                      <div className="message-detail-row">
                        <span className="message-detail-label">{t('readingPane.detailTo')}</span>
                        <span>{message.to.map((p) => `${p.name} <${p.email}>`).join(', ')}</span>
                      </div>
                    )}
                    {message.cc.length > 0 && (
                      <div className="message-detail-row">
                        <span className="message-detail-label">{t('readingPane.detailCc')}</span>
                        <span>{message.cc.map((p) => `${p.name} <${p.email}>`).join(', ')}</span>
                      </div>
                    )}
                    <div className="message-detail-row">
                      <span className="message-detail-label">{t('readingPane.detailDate')}</span>
                      <span>{formatFullDate(message.date)}</span>
                    </div>
                    <div className="message-detail-row">
                      <span className="message-detail-label">{t('readingPane.detailSubject')}</span>
                      <span>{message.subject}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <MessageBody message={message} />
          </article>
        ))}
      </div>

      <footer className="reply-box">
        <button className="reply-btn" onClick={handleReply}>
          {t('readingPane.reply')}
        </button>
        {showReplyAll && (
          <button className="reply-btn" onClick={handleReplyAll}>
            {t('readingPane.replyAll')}
          </button>
        )}
        <button className="reply-btn" onClick={handleForward}>
          {t('readingPane.forward')}
        </button>
      </footer>
    </section>
  )
}
