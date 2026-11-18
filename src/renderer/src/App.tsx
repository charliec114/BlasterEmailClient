import { useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import MessageList from './components/MessageList'
import ReadingPane from './components/ReadingPane'
import AssistantPanel from './components/AssistantPanel'
import ScheduledPanel from './components/ScheduledPanel'
import DraftsPanel from './components/DraftsPanel'
import ComposeModal from './components/ComposeModal'
import UpdateModal from './components/UpdateModal'
import Toaster from './components/Toaster'
import { useComposeStore } from './store/useComposeStore'
import { useSettingsStore } from './store/useSettingsStore'
import { useMailStore, ASSISTANT_VIEW_ID, SCHEDULED_VIEW_ID, DRAFTS_VIEW_ID } from './store/useMailStore'
import { useQueuedDraftsStore } from './store/useQueuedDraftsStore'
import { useToastStore } from './store/useToastStore'
import { translate } from './i18n/useT'

function App() {
  const draft = useComposeStore((s) => s.draft)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const selectedFolderId = useMailStore((s) => s.selectedFolderId)
  const isAssistantView = selectedFolderId === ASSISTANT_VIEW_ID
  const isScheduledView = selectedFolderId === SCHEDULED_VIEW_ID
  const isDraftsView = selectedFolderId === DRAFTS_VIEW_ID

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Borradores del servidor MCP (draft_mail / draft_reply): se acumulan en la sección Borradores y
  // no se abren solos — antes se abrían de a uno, sin forma de ver cuántos había ni de elegir.
  const fetchQueuedDrafts = useQueuedDraftsStore((s) => s.fetch)
  const knownDraftCount = useRef(0)
  useEffect(() => {
    async function refresh(): Promise<void> {
      const count = await fetchQueuedDrafts()
      if (count > knownDraftCount.current) {
        const language = useSettingsStore.getState().language
        useToastStore.getState().show(
          {
            kind: 'info',
            message: translate(language, 'draftsPanel.newDraftToast'),
            action: { label: translate(language, 'draftsPanel.view'), onClick: () => useMailStore.getState().selectDraftsView() }
          },
          8000
        )
      }
      knownDraftCount.current = count
    }
    void fetchQueuedDrafts().then((count) => {
      knownDraftCount.current = count
    })
    return window.api.mcp.onDraftsChanged(() => void refresh())
  }, [fetchQueuedDrafts])

  return (
    <div className="app-shell">
      <Sidebar />
      {isAssistantView ? (
        <AssistantPanel />
      ) : isScheduledView ? (
        <ScheduledPanel />
      ) : isDraftsView ? (
        <DraftsPanel />
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
