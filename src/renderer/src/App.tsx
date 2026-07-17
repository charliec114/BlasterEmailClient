import { useEffect } from 'react'
import Sidebar from './components/Sidebar'
import MessageList from './components/MessageList'
import ReadingPane from './components/ReadingPane'
import ComposeModal from './components/ComposeModal'
import { useComposeStore } from './store/useComposeStore'
import { useSettingsStore } from './store/useSettingsStore'

function App() {
  const draft = useComposeStore((s) => s.draft)
  const loadSettings = useSettingsStore((s) => s.loadSettings)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  return (
    <div className="app-shell">
      <Sidebar />
      <MessageList />
      <ReadingPane />
      {draft && <ComposeModal draft={draft} />}
    </div>
  )
}

export default App
