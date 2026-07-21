import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PendingAskHistoryEntry, PendingThreadRef } from '@shared/types'

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  meta?: { threadCount: number; messageCount: number; truncated: boolean; threads: PendingThreadRef[] }
  error?: boolean
}

export interface AssistantConversation {
  id: string
  title: string
  // Lista vacía = todas las cuentas (sin filtro); lista con ids = solo esas cuentas.
  accountIds: string[]
  fromDate: string
  toDate: string
  messages: AssistantMessage[]
  createdAt: string
}

const HISTORY_TURNS = 6
const TITLE_MAX_CHARS = 48

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function defaultFrom(): string {
  const date = new Date()
  date.setDate(date.getDate() - 7)
  return isoDate(date)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function titleFromQuestion(question: string): string {
  const trimmed = question.trim()
  return trimmed.length > TITLE_MAX_CHARS ? `${trimmed.slice(0, TITLE_MAX_CHARS)}…` : trimmed
}

// Reconstruye los últimos intercambios pregunta/respuesta de la conversación activa para
// mandarle contexto conversacional al modelo — así una pregunta como "¿y de la otra cuenta?"
// tiene sentido. Se ignoran los pares donde la respuesta fue un error.
function buildHistory(messages: AssistantMessage[]): PendingAskHistoryEntry[] {
  const pairs: PendingAskHistoryEntry[] = []
  for (let i = 0; i < messages.length - 1; i++) {
    const question = messages[i]
    const answer = messages[i + 1]
    if (question.role === 'user' && answer.role === 'assistant' && !answer.error) {
      pairs.push({ question: question.content, answer: answer.content })
    }
  }
  return pairs.slice(-HISTORY_TURNS)
}

function createConversation(): AssistantConversation {
  return {
    id: crypto.randomUUID(),
    title: '',
    accountIds: [],
    fromDate: defaultFrom(),
    toDate: isoDate(new Date()),
    messages: [],
    createdAt: new Date().toISOString()
  }
}

interface AssistantStore {
  conversations: AssistantConversation[]
  activeConversationId: string
  question: string
  asking: boolean
  activeConversation: () => AssistantConversation
  setAccountIds: (accountIds: string[]) => void
  setFromDate: (date: string) => void
  setToDate: (date: string) => void
  setQuestion: (question: string) => void
  newConversation: () => void
  switchConversation: (id: string) => void
  deleteConversation: (id: string) => void
  ask: () => Promise<void>
}

function updateConversation(
  conversations: AssistantConversation[],
  id: string,
  updater: (conversation: AssistantConversation) => AssistantConversation
): AssistantConversation[] {
  return conversations.map((c) => (c.id === id ? updater(c) : c))
}

export const useAssistantStore = create<AssistantStore>()(
  persist(
    (set, get) => {
      const initial = createConversation()

      return {
        conversations: [initial],
        activeConversationId: initial.id,
        question: '',
        asking: false,

        activeConversation: () => {
          const { conversations, activeConversationId } = get()
          return conversations.find((c) => c.id === activeConversationId) ?? conversations[0]
        },

        setAccountIds: (accountIds) =>
          set((s) => ({ conversations: updateConversation(s.conversations, s.activeConversationId, (c) => ({ ...c, accountIds })) })),
        setFromDate: (fromDate) =>
          set((s) => ({ conversations: updateConversation(s.conversations, s.activeConversationId, (c) => ({ ...c, fromDate })) })),
        setToDate: (toDate) =>
          set((s) => ({ conversations: updateConversation(s.conversations, s.activeConversationId, (c) => ({ ...c, toDate })) })),
        setQuestion: (question) => set({ question }),

        newConversation: () => {
          const conversation = createConversation()
          set((s) => ({ conversations: [conversation, ...s.conversations], activeConversationId: conversation.id, question: '' }))
        },

        switchConversation: (id) => set({ activeConversationId: id, question: '' }),

        deleteConversation: (id) => {
          set((s) => {
            const remaining = s.conversations.filter((c) => c.id !== id)
            if (remaining.length === 0) {
              const conversation = createConversation()
              return { conversations: [conversation], activeConversationId: conversation.id, question: '' }
            }
            const activeConversationId = s.activeConversationId === id ? remaining[0].id : s.activeConversationId
            return { conversations: remaining, activeConversationId }
          })
        },

        ask: async () => {
          const { question, asking, activeConversation } = get()
          const conversation = activeConversation()
          const trimmed = question.trim()
          if (!trimmed || asking) return

          const history = buildHistory(conversation.messages)
          const userMessage: AssistantMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed }
          const isFirstMessage = conversation.messages.length === 0

          set((s) => ({
            conversations: updateConversation(s.conversations, conversation.id, (c) => ({
              ...c,
              title: isFirstMessage ? titleFromQuestion(trimmed) : c.title,
              messages: [...c.messages, userMessage]
            })),
            question: '',
            asking: true
          }))

          try {
            const response = await window.api.pending.ask({
              accountIds: conversation.accountIds,
              fromDate: `${conversation.fromDate}T00:00:00.000Z`,
              toDate: `${conversation.toDate}T23:59:59.999Z`,
              question: trimmed,
              history
            })
            const assistantMessage: AssistantMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: response.answer,
              meta: {
                threadCount: response.threadCount,
                messageCount: response.messageCount,
                truncated: response.truncated,
                threads: response.threads
              }
            }
            set((s) => ({
              conversations: updateConversation(s.conversations, conversation.id, (c) => ({
                ...c,
                messages: [...c.messages, assistantMessage]
              })),
              asking: false
            }))
          } catch (err) {
            const failedMessage: AssistantMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: errorMessage(err),
              error: true
            }
            set((s) => ({
              conversations: updateConversation(s.conversations, conversation.id, (c) => ({
                ...c,
                messages: [...c.messages, failedMessage]
              })),
              asking: false
            }))
          }
        }
      }
    },
    {
      name: 'blaster-assistant-conversations',
      version: 1,
      // v0 guardaba `accountId: string` por conversación; v1 pasó a `accountIds: string[]`
      // para poder elegir varias cuentas. Migramos lo persistido en vez de descartarlo.
      migrate: (persisted) => {
        const state = persisted as { conversations?: (AssistantConversation & { accountId?: string })[] }
        state.conversations = (state.conversations ?? []).map((c) => ({
          ...c,
          accountIds: c.accountIds ?? (c.accountId ? [c.accountId] : [])
        }))
        return state as AssistantStore
      }
    }
  )
)
