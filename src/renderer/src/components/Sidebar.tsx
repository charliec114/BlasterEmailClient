import { useCallback, useEffect, useState } from 'react'
import { useAccountStore } from '../store/useAccountStore'
import { useMailStore } from '../store/useMailStore'
import { useMailDataStore } from '../store/useMailDataStore'
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

export default function Sidebar() {
  const { t } = useT()
  const accounts = useAccountStore((s) => s.accounts)
  const loadingAccounts = useAccountStore((s) => s.loading)
  const fetchAccounts = useAccountStore((s) => s.fetchAccounts)

  const foldersByAccount = useMailDataStore((s) => s.foldersByAccount)
  const syncingAccountIds = useMailDataStore((s) => s.syncingAccountIds)
  const fetchFolders = useMailDataStore((s) => s.fetchFolders)
  const fetchThreads = useMailDataStore((s) => s.fetchThreads)
  const syncAccountData = useMailDataStore((s) => s.syncAccount)

  const selectedFolderId = useMailStore((s) => s.selectedFolderId)
  const selectFolder = useMailStore((s) => s.selectFolder)

  const [wizardTarget, setWizardTarget] = useState<WizardTarget | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showContacts, setShowContacts] = useState(false)
  const isSyncing = syncingAccountIds.length > 0

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const syncAllAccounts = useCallback(async () => {
    await Promise.all(accounts.map((account) => syncAccountData(account.id)))
    const current = useMailStore.getState()
    if (current.selectedAccountId && current.selectedFolderId) {
      fetchThreads(current.selectedAccountId, current.selectedFolderId)
    }
  }, [accounts, syncAccountData, fetchThreads])

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
      const firstFolder = foldersByAccount[accounts[0].id]?.[0]
      if (firstFolder) selectFolder(accounts[0].id, firstFolder.id, firstFolder.name)
    }
  }, [accounts, foldersByAccount, selectedFolderId, selectFolder])

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

        {accounts.map((account) => (
          <div key={account.id} className="sidebar-account">
            <div className="sidebar-account-name">
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
          </div>
        ))}
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
