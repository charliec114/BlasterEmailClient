import { useEffect } from 'react'
import Sidebar from './components/Sidebar'
import MessageList from './components/MessageList'
import ReadingPane from './components/ReadingPane'
import AssistantPanel from './components/AssistantPanel'
import ScheduledPanel from './components/ScheduledPanel'
import ComposeModal from './components/ComposeModal'
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
    </div>
  )
}

export default App
