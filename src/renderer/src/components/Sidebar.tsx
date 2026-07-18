import { useCallback, useEffect, useState, type DragEvent } from 'react'
import { useAccountStore } from '../store/useAccountStore'
import { useMailStore, UNIFIED_INBOX_ID } from '../store/useMailStore'
import { useMailDataStore } from '../store/useMailDataStore'
import { useSettingsStore } from '../store/useSettingsStore'
import AccountWizard from './AccountWizard'
import SettingsModal from './SettingsModal'
import ContactsModal from './ContactsModal'
import { useT } from '../i18n/useT'
import type { Account } from '@shared/types'

const FOLDER_ICONS: Record<string, string> = {
  inbox: '📥',
  sent: '📤',
  drafts: '📝',
  trash: '🗑️',
  archive: '🗄️',
  custom: '📁'
}

const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000

type WizardTarget = 'add' | Account

function resolveOrder(saved: string[], accountIds: string[]): string[] {
  const all = [UNIFIED_INBOX_ID, ...accountIds]
  const known = new Set(all)
  const kept = saved.filter((id) => known.has(id))
  const missing = all.filter((id) => !kept.includes(id))
  return [...kept, ...missing]
}

export default function Sidebar() {
  const { t } = useT()
  const accounts = useAccountStore((s) => s.accounts)
  const loadingAccounts = useAccountStore((s) => s.loading)
  const fetchAccounts = useAccountStore((s) => s.fetchAccounts)

  const foldersByAccount = useMailDataStore((s) => s.foldersByAccount)
  const syncingAccountIds = useMailDataStore((s) => s.syncingAccountIds)
  const fetchFolders = useMailDataStore((s) => s.fetchFolders)
  const fetchThreads = useMailDataStore((s) => s.fetchThreads)
  const fetchUnifiedInbox = useMailDataStore((s) => s.fetchUnifiedInbox)
  const syncAccountData = useMailDataStore((s) => s.syncAccount)

  const selectedFolderId = useMailStore((s) => s.selectedFolderId)
  const selectFolder = useMailStore((s) => s.selectFolder)
  const selectUnifiedInbox = useMailStore((s) => s.selectUnifiedInbox)

  const sidebarOrder = useSettingsStore((s) => s.sidebarOrder)
  const setSidebarOrder = useSettingsStore((s) => s.setSidebarOrder)
  const collapsedAccountIds = useSettingsStore((s) => s.collapsedAccountIds)
  const toggleAccountCollapsed = useSettingsStore((s) => s.toggleAccountCollapsed)

  const [wizardTarget, setWizardTarget] = useState<WizardTarget | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showContacts, setShowContacts] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<{ id: string; after: boolean } | null>(null)
  const isSyncing = syncingAccountIds.length > 0

  const order = resolveOrder(
    sidebarOrder,
    accounts.map((a) => a.id)
  )

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const syncAllAccounts = useCallback(async () => {
    await Promise.all(accounts.map((account) => syncAccountData(account.id)))
    const current = useMailStore.getState()
    if (current.selectedFolderId === UNIFIED_INBOX_ID) {
      fetchUnifiedInbox()
    } else if (current.selectedAccountId && current.selectedFolderId) {
      fetchThreads(current.selectedAccountId, current.selectedFolderId)
    }
  }, [accounts, syncAccountData, fetchThreads, fetchUnifiedInbox])

  useEffect(() => {
    accounts.forEach((account) => {
      if (!foldersByAccount[account.id]) fetchFolders(account.id)
    })
  }, [accounts, foldersByAccount, fetchFolders])

  useEffect(() => {
    if (accounts.length === 0) return
    syncAllAccounts()
    const interval = setInterval(syncAllAccounts, AUTO_SYNC_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length])

  useEffect(() => {
    if (selectedFolderId === null && accounts.length > 0) {
      selectUnifiedInbox(t('sidebar.unifiedInbox'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length, selectedFolderId])

  function handleDragOver(e: DragEvent<HTMLDivElement>, targetId: string): void {
    e.preventDefault()
    if (!draggedId || draggedId === targetId) return
    const rect = e.currentTarget.getBoundingClientRect()
    const after = e.clientY - rect.top > rect.height / 2
    setDropIndicator((prev) => (prev?.id === targetId && prev.after === after ? prev : { id: targetId, after }))
  }

  function handleDrop(targetId: string): void {
    if (draggedId && draggedId !== targetId) {
      const withoutDragged = order.filter((id) => id !== draggedId)
      let targetIndex = withoutDragged.indexOf(targetId)
      if (dropIndicator?.id === targetId && dropIndicator.after) targetIndex += 1
      withoutDragged.splice(targetIndex, 0, draggedId)
      setSidebarOrder(withoutDragged)
    }
    setDraggedId(null)
    setDropIndicator(null)
  }

  function handleDragEnd(): void {
    setDraggedId(null)
    setDropIndicator(null)
  }

  const unifiedUnreadCount = accounts.reduce((sum, account) => {
    const inboxFolder = (foldersByAccount[account.id] ?? []).find((f) => f.kind === 'inbox')
    return sum + (inboxFolder?.unreadCount ?? 0)
  }, 0)

  return (
    <aside className="sidebar">
      <div className="sidebar-header">{t('sidebar.accountsHeader')}</div>

      <button type="button" className="sync-all-btn" disabled={isSyncing || accounts.length === 0} onClick={syncAllAccounts}>
        <span className={isSyncing ? 'sync-icon spinning' : 'sync-icon'}>🔄</span>
        {isSyncing ? t('sidebar.syncing') : t('sidebar.searchUpdates')}
      </button>

      <nav className="sidebar-nav">
        {loadingAccounts && accounts.length === 0 && <div className="sidebar-empty">{t('common.loading')}</div>}

        {!loadingAccounts && accounts.length === 0 && (
          <div className="sidebar-empty">{t('sidebar.noAccounts')}</div>
        )}

        {order.map((itemId) => {
          if (itemId === UNIFIED_INBOX_ID) {
            return (
              <div
                key={UNIFIED_INBOX_ID}
                className={[
                  'sidebar-unified-row',
                  draggedId === UNIFIED_INBOX_ID ? 'dragging' : '',
                  dropIndicator?.id === UNIFIED_INBOX_ID ? (dropIndicator.after ? 'drop-after' : 'drop-before') : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable
                onDragStart={() => setDraggedId(UNIFIED_INBOX_ID)}
                onDragOver={(e) => handleDragOver(e, UNIFIED_INBOX_ID)}
                onDrop={() => handleDrop(UNIFIED_INBOX_ID)}
                onDragEnd={handleDragEnd}
              >
                <button
                  type="button"
                  className={`sidebar-folder-btn ${selectedFolderId === UNIFIED_INBOX_ID ? 'active' : ''}`}
                  onClick={() => selectUnifiedInbox(t('sidebar.unifiedInbox'))}
                >
                  <span className="folder-icon">📬</span>
                  <span className="folder-name">{t('sidebar.unifiedInbox')}</span>
                  {unifiedUnreadCount > 0 && <span className="folder-badge">{unifiedUnreadCount}</span>}
                </button>
              </div>
            )
          }

          const account = accounts.find((a) => a.id === itemId)
          if (!account) return null
          const collapsed = collapsedAccountIds.includes(account.id)

          return (
            <div
              key={account.id}
              className={[
                'sidebar-account',
                draggedId === account.id ? 'dragging' : '',
                dropIndicator?.id === account.id ? (dropIndicator.after ? 'drop-after' : 'drop-before') : ''
              ]
                .filter(Boolean)
                .join(' ')}
              draggable
              onDragStart={() => setDraggedId(account.id)}
              onDragOver={(e) => handleDragOver(e, account.id)}
              onDrop={() => handleDrop(account.id)}
              onDragEnd={handleDragEnd}
            >
              <div className="sidebar-account-name">
                <button
                  type="button"
                  className="collapse-account-btn"
                  title={collapsed ? t('sidebar.expandAccount') : t('sidebar.collapseAccount')}
                  onClick={() => toggleAccountCollapsed(account.id)}
                >
                  {collapsed ? '▸' : '▾'}
                </button>
                <span className="account-dot" style={{ backgroundColor: account.color }} />
                <span className="account-name-text">{account.displayName}</span>
                <button
                  type="button"
                  className="edit-account-btn"
                  title={t('sidebar.editAccountTitle')}
                  onClick={() => setWizardTarget(account)}
                >
                  ⚙️
                </button>
              </div>
              {!collapsed && (
                <ul className="sidebar-folders">
                  {(foldersByAccount[account.id] ?? []).map((folder) => (
                    <li key={folder.id}>
                      <button
                        className={`sidebar-folder-btn ${folder.id === selectedFolderId ? 'active' : ''}`}
                        onClick={() => selectFolder(account.id, folder.id, folder.name)}
                      >
                        <span className="folder-icon">{FOLDER_ICONS[folder.kind]}</span>
                        <span className="folder-name">{folder.name}</span>
                        {folder.unreadCount > 0 && <span className="folder-badge">{folder.unreadCount}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </nav>

      <button type="button" className="add-account-btn" onClick={() => setWizardTarget('add')}>
        {t('sidebar.addAccount')}
      </button>

      <button type="button" className="add-account-btn" onClick={() => setShowContacts(true)}>
        {t('sidebar.contacts')}
      </button>

      <button type="button" className="add-account-btn" onClick={() => setShowSettings(true)}>
        {t('sidebar.settings')}
      </button>

      {wizardTarget && (
        <AccountWizard
          editingAccount={wizardTarget === 'add' ? undefined : wizardTarget}
          onClose={() => setWizardTarget(null)}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showContacts && <ContactsModal onClose={() => setShowContacts(false)} />}
    </aside>
  )
}
