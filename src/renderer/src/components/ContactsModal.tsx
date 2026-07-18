import { useEffect, useState } from 'react'
import { useAccountStore } from '../store/useAccountStore'
import { useComposeStore } from '../store/useComposeStore'
import { useT } from '../i18n/useT'
import type { Contact } from '@shared/types'

interface ContactsModalProps {
  onClose: () => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function ContactsModal({ onClose }: ContactsModalProps) {
  const { t } = useT()
  const accounts = useAccountStore((s) => s.accounts)
  const openCompose = useComposeStore((s) => s.openCompose)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [editingEmail, setEditingEmail] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    window.api.contacts.list().then((result) => {
      setContacts(result)
      setLoading(false)
    })
  }, [])

  function handleCompose(contact: Contact): void {
    if (accounts.length === 0) return
    openCompose({ accountId: accounts[0].id, to: contact.email })
    onClose()
  }

  async function handleDelete(contact: Contact): Promise<void> {
    await window.api.contacts.remove(contact.email)
    setContacts((prev) => prev.filter((c) => c.email !== contact.email))
  }

  function startEdit(contact: Contact): void {
    setEditingEmail(contact.email)
    setEditName(contact.name || '')
    setEditEmail(contact.email)
    setEditError(null)
  }

  function cancelEdit(): void {
    setEditingEmail(null)
    setEditError(null)
  }

  async function handleSaveEdit(): Promise<void> {
    if (!editingEmail) return
    setSaving(true)
    setEditError(null)
    try {
      const updated = await window.api.contacts.update(editingEmail, editName, editEmail)
      setContacts((prev) => prev.map((c) => (c.email === editingEmail ? updated : c)))
      setEditingEmail(null)
    } catch (error) {
      setEditError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box contacts-box">
        <div className="modal-header-row">
          <h2>{t('contactsModal.title')}</h2>
          <button type="button" className="modal-close-btn" title={t('common.close')} onClick={onClose}>
            ✕
          </button>
        </div>

        {loading && <p className="sidebar-empty">{t('common.loading')}</p>}
        {!loading && contacts.length === 0 && <p className="sidebar-empty">{t('contactsModal.empty')}</p>}

        <ul className="contacts-list">
          {contacts.map((contact) => (
            <li key={contact.email} className="contact-row">
              {editingEmail === contact.email ? (
                <div className="contact-edit-form">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={t('accountWizard.displayName')}
                  />
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder={t('accountWizard.email')}
                  />
                  {editError && <div className="test-fail">{editError}</div>}
                  <div className="contact-edit-actions">
                    <button type="button" className="reply-btn" onClick={cancelEdit}>
                      {t('common.cancel')}
                    </button>
                    <button type="button" className="reply-btn ai-btn" disabled={saving} onClick={handleSaveEdit}>
                      {saving ? t('accountWizard.savingStatus') : t('common.save')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <div className="contact-name">{contact.name || contact.email}</div>
                    {contact.name && <div className="contact-email">{contact.email}</div>}
                  </div>
                  <div className="contact-actions">
                    <button type="button" className="reply-btn" onClick={() => handleCompose(contact)}>
                      {t('contactsModal.newMessage')}
                    </button>
                    <button
                      type="button"
                      className="edit-account-btn"
                      title={t('contactsModal.editContact')}
                      onClick={() => startEdit(contact)}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="edit-account-btn"
                      title={t('contactsModal.deleteContact')}
                      onClick={() => handleDelete(contact)}
                    >
                      🗑️
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>

        <div className="modal-actions">
          <button type="button" className="reply-btn ai-btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
