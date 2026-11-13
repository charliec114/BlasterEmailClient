import { useEffect, useRef } from 'react'
import type { ComposeDraft } from '@shared/types'
import Sidebar from './components/Sidebar'
import MessageList from './components/MessageList'
import ReadingPane from './components/ReadingPane'
import AssistantPanel from './components/AssistantPanel'
import ScheduledPanel from './components/ScheduledPanel'
import ComposeModal from './components/ComposeModal'
import UpdateModal from './components/UpdateModal'
import Toaster from './components/Toaster'
import { useComposeStore } from './store/useComposeStore'
import { useSettingsStore } from './store/useSettingsStore'
import { useMailStore, ASSISTANT_VIEW_ID, SCHEDULED_VIEW_ID } from './store/useMailStore'

function App() {
  const draft = useComposeStore((s) => s.draft)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const selectedFolderId = useMailStore((s) => s.selectedFolderId)
  const isAssistantView = selectedFolderId === ASSISTANT_VIEW_ID
  const isScheduledView = selectedFolderId === SCHEDULED_VIEW_ID

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Cola de borradores del servidor MCP (draft_mail / draft_reply): se abre de a uno, nunca sobre
  // un redactor en uso, y al cerrarse el actual (enviado, programado o descartado) sigue el próximo.
  const hasDraft = draft !== null
  const stashedDrafts = useRef<ComposeDraft[]>([])
  useEffect(() => {
    async function openNext(): Promise<void> {
      if (useComposeStore.getState().draft) return
      const next = stashedDrafts.current.shift() ?? (await window.api.mcp.takeNextDraft())
      if (!next) return
      // Si mientras esperábamos se abrió otro redactor, el borrador espera su turno acá.
      if (useComposeStore.getState().draft) stashedDrafts.current.push(next)
      else useComposeStore.getState().openCompose(next)
    }
    if (!hasDraft) void openNext()
    return window.api.mcp.onDraftsChanged(() => void openNext())
  }, [hasDraft])

  return (
    <div className="app-shell">
      <Sidebar />
      {isAssistantView ? (
        <AssistantPanel />
      ) : isScheduledView ? (
        <ScheduledPanel />
      ) : (
        <>
          <MessageList />
          <ReadingPane />
        </>
      )}
      {draft && <ComposeModal draft={draft} />}
      <UpdateModal />
      <Toaster />
    </div>
  )
}

export default App
