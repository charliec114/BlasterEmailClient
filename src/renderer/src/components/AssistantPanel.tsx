import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { useAccountStore } from '../store/useAccountStore'
import { useAssistantStore, type AssistantMessage } from '../store/useAssistantStore'
import { useMailStore } from '../store/useMailStore'
import { useMailDataStore } from '../store/useMailDataStore'
import { useT } from '../i18n/useT'
import type { PendingThreadRef } from '@shared/types'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default function AssistantPanel() {
  const { t } = useT()
  const accounts = useAccountStore((s) => s.accounts)

  const conversations = useAssistantStore((s) => s.conversations)
  const activeConversationId = useAssistantStore((s) => s.activeConversationId)
  const question = useAssistantStore((s) => s.question)
  const asking = useAssistantStore((s) => s.asking)
  const setAccountIds = useAssistantStore((s) => s.setAccountIds)
  const setFromDate = useAssistantStore((s) => s.setFromDate)
  const setToDate = useAssistantStore((s) => s.setToDate)
  const setQuestion = useAssistantStore((s) => s.setQuestion)
  const newConversation = useAssistantStore((s) => s.newConversation)
  const switchConversation = useAssistantStore((s) => s.switchConversation)
  const deleteConversation = useAssistantStore((s) => s.deleteConversation)
  const ask = useAssistantStore((s) => s.ask)
  const selectUnifiedInbox = useMailStore((s) => s.selectUnifiedInbox)
  const selectThread = useMailStore((s) => s.selectThread)
  const searchMail = useMailDataStore((s) => s.search)

  const conversation = conversations.find((c) => c.id === activeConversationId) ?? conversations[0]
  const scrollRef = useRef<HTMLDivElement>(null)
  const [accountsOpen, setAccountsOpen] = useState(false)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [conversation.messages, asking])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      ask()
    }
  }

  function handleDelete(e: MouseEvent, id: string): void {
    e.stopPropagation()
    deleteConversation(id)
  }

  const allAccountIds = accounts.map((a) => a.id)
  const isAllSelected = conversation.accountIds.length === 0

  function isAccountChecked(accountId: string): boolean {
    return isAllSelected || conversation.accountIds.includes(accountId)
  }

  function toggleAccount(accountId: string): void {
    const current = isAllSelected ? allAccountIds : conversation.accountIds
    const next = current.includes(accountId) ? current.filter((id) => id !== accountId) : [...current, accountId]
    setAccountIds(next.length === allAccountIds.length ? [] : next)
  }

  function accountsSummary(): string {
    if (isAllSelected) return t('assistantPanel.allAccounts')
    if (conversation.accountIds.length === 1) {
      const account = accounts.find((a) => a.id === conversation.accountIds[0])
      if (account) return account.displayName
    }
    return t('assistantPanel.accountsSelectedCount', { count: String(conversation.accountIds.length) })
  }

  // Navega al hilo real: sale de la vista del Asistente, reusa la búsqueda global
  // (ya cruza todas las cuentas/carpetas) para traer el hilo al MessageList, y lo selecciona.
  async function openThread(ref: PendingThreadRef): Promise<void> {
    selectUnifiedInbox(t('sidebar.unifiedInbox'))
    await searchMail(ref.subject)
    selectThread(ref.threadKey)
  }

  // El modelo menciona los hilos por su asunto en la respuesta — los detectamos por texto
  // (los asuntos exactos que le pasamos en el digest) y los convertimos en links clickeables.
  function renderContent(message: AssistantMessage): ReactNode {
    const threads = message.meta?.threads ?? []
    const knownSubjects = threads.map((ref) => ref.subject).filter((subject) => subject.trim())
    if (knownSubjects.length === 0) return message.content

    const pattern = knownSubjects
      .slice()
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join('|')
    const parts = message.content.split(new RegExp(`(${pattern})`, 'gi'))

    return parts.map((part, index) => {
      const match = threads.find((ref) => ref.subject.toLowerCase() === part.toLowerCase())
      if (!match) return part
      return (
        <button key={index} type="button" className="assistant-thread-link" onClick={() => openThread(match)}>
          {part}
        </button>
      )
    })
  }

  return (
    <section className="assistant-panel">
      <aside className="assistant-conversations">
        <button type="button" className="assistant-new-chat-btn" onClick={newConversation}>
          + {t('assistantPanel.newConversation')}
        </button>
        <ul className="assistant-conversation-list">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`assistant-conversation-item ${c.id === activeConversationId ? 'active' : ''}`}
                onClick={() => switchConversation(c.id)}
              >
                <span className="assistant-conversation-title">{c.title || t('assistantPanel.untitled')}</span>
                {conversations.length > 1 && (
                  <span className="assistant-conversation-delete" onClick={(e) => handleDelete(e, c.id)} title={t('common.close')}>
                    ✕
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="assistant-chat-area">
        <header className="assistant-panel-header">
          <h1>✨ {t('sidebar.assistant')}</h1>
          <p className="assistant-panel-description">{t('assistantPanel.description')}</p>

          <div className="assistant-panel-filters">
            <div className="assistant-accounts-select">
              <span className="assistant-panel-accounts-label">{t('assistantPanel.account')}</span>
              <button type="button" className="assistant-accounts-trigger" onClick={() => setAccountsOpen((v) => !v)}>
                {accountsSummary()} ▾
              </button>
              {accountsOpen && (
                <>
                  <div className="assistant-accounts-overlay" onClick={() => setAccountsOpen(false)} />
                  <div className="assistant-accounts-dropdown">
                    <label className="assistant-account-checkbox">
                      <input type="checkbox" checked={isAllSelected} onChange={() => setAccountIds([])} />
                      {t('assistantPanel.allAccounts')}
                    </label>
                    <div className="assistant-accounts-dropdown-list">
                      {accounts.map((account) => (
                        <label key={account.id} className="assistant-account-checkbox">
                          <input type="checkbox" checked={isAccountChecked(account.id)} onChange={() => toggleAccount(account.id)} />
                          {account.displayName}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <label>
              {t('assistantPanel.from')}
              <input type="date" value={conversation.fromDate} max={conversation.toDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label>
              {t('assistantPanel.to')}
              <input type="date" value={conversation.toDate} min={conversation.fromDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
          </div>
        </header>

        <div className="assistant-chat-messages" ref={scrollRef}>
          {conversation.messages.length === 0 && !asking && (
            <p className="assistant-panel-placeholder">{t('assistantPanel.emptyState')}</p>
          )}

          {conversation.messages.map((message) => (
            <div key={message.id} className={`assistant-chat-row ${message.role}`}>
              <div className={`assistant-chat-bubble ${message.role} ${message.error ? 'error' : ''}`}>
                {message.error ? t('assistantPanel.error', { error: message.content }) : renderContent(message)}
                {message.meta && (
                  <div className="assistant-chat-meta">
                    {t('assistantPanel.scanned', {
                      threadCount: String(message.meta.threadCount),
                      messageCount: String(message.meta.messageCount)
                    })}
                    {message.meta.truncated && (
                      <span className="assistant-panel-truncated"> · {t('assistantPanel.truncatedNote')}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {asking && (
            <div className="assistant-chat-row assistant">
              <div className="assistant-chat-bubble assistant assistant-chat-typing">{t('assistantPanel.asking')}</div>
            </div>
          )}
        </div>

        <div className="assistant-chat-input-row">
          <textarea
            rows={1}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('assistantPanel.questionPlaceholder')}
          />
          <button type="button" className="reply-btn ai-btn" disabled={asking || !question.trim()} onClick={ask}>
            {t('assistantPanel.ask')}
          </button>
        </div>
      </div>
    </section>
  )
}
