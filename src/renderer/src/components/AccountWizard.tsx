import { useState } from 'react'
import { useAccountStore } from '../store/useAccountStore'
import { useMailDataStore } from '../store/useMailDataStore'
import EmailBodyFrame from './EmailBodyFrame'
import { useT } from '../i18n/useT'
import type { Account, AccountInput, AccountProtocol, ConnectionTestResult } from '@shared/types'

const ACCOUNT_COLORS = ['#0a84ff', '#ff9f0a', '#30d158', '#ff375f', '#bf5af2', '#64d2ff']

interface FormState {
  displayName: string
  email: string
  protocol: AccountProtocol
  incomingHost: string
  incomingPort: string
  incomingSecure: boolean
  incomingUsername: string
  incomingPassword: string
  outgoingSameAsIncoming: boolean
  outgoingHost: string
  outgoingPort: string
  outgoingSecure: boolean
  outgoingUsername: string
  outgoingPassword: string
  signatureHtml: string
}

function defaultIncomingPort(protocol: AccountProtocol, secure: boolean): string {
  if (protocol === 'imap') return secure ? '993' : '143'
  return secure ? '995' : '110'
}

function emptyForm(): FormState {
  return {
    displayName: '',
    email: '',
    protocol: 'imap',
    incomingHost: '',
    incomingPort: defaultIncomingPort('imap', true),
    incomingSecure: true,
    incomingUsername: '',
    incomingPassword: '',
    outgoingSameAsIncoming: true,
    outgoingHost: '',
    outgoingPort: '587',
    outgoingSecure: true,
    outgoingUsername: '',
    outgoingPassword: '',
    signatureHtml: ''
  }
}

function formFromAccount(account: Account): FormState {
  const sameServer =
    account.incoming.host === account.outgoing.host && account.incoming.username === account.outgoing.username

  return {
    displayName: account.displayName,
    email: account.email,
    protocol: account.protocol,
    incomingHost: account.incoming.host,
    incomingPort: String(account.incoming.port),
    incomingSecure: account.incoming.secure,
    incomingUsername: account.incoming.username,
    incomingPassword: '',
    outgoingSameAsIncoming: sameServer,
    outgoingHost: account.outgoing.host,
    outgoingPort: String(account.outgoing.port),
    outgoingSecure: account.outgoing.secure,
    outgoingUsername: account.outgoing.username,
    outgoingPassword: '',
    signatureHtml: account.signatureHtml
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface AccountWizardProps {
  editingAccount?: Account
  onClose: () => void
}

export default function AccountWizard({ editingAccount, onClose }: AccountWizardProps) {
  const { t } = useT()
  const addAccount = useAccountStore((s) => s.addAccount)
  const updateAccount = useAccountStore((s) => s.updateAccount)
  const testConnection = useAccountStore((s) => s.testConnection)
  const connectGoogle = useAccountStore((s) => s.connectGoogle)

  const isEditing = Boolean(editingAccount)

  const [mode, setMode] = useState<'picker' | 'manual'>(isEditing ? 'manual' : 'picker')
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null)
  const [providerError, setProviderError] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>(() => (editingAccount ? formFromAccount(editingAccount) : emptyForm()))
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleConnectGoogle(): Promise<void> {
    setConnectingProvider('google')
    setProviderError(null)
    try {
      await connectGoogle()
      onClose()
    } catch (error) {
      setProviderError(errorMessage(error))
    } finally {
      setConnectingProvider(null)
    }
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
    setTestResult(null)
    setFormError(null)
  }

  function setProtocol(protocol: AccountProtocol): void {
    setForm((prev) => ({ ...prev, protocol, incomingPort: defaultIncomingPort(protocol, prev.incomingSecure) }))
    setTestResult(null)
  }

  function setIncomingSecure(secure: boolean): void {
    setForm((prev) => ({ ...prev, incomingSecure: secure, incomingPort: defaultIncomingPort(prev.protocol, secure) }))
    setTestResult(null)
  }

  const incomingUsername = form.incomingUsername || form.email

  function buildInput(): AccountInput {
    return {
      displayName: form.displayName || form.email,
      email: form.email,
      protocol: form.protocol,
      color: editingAccount?.color ?? ACCOUNT_COLORS[Math.floor(Math.random() * ACCOUNT_COLORS.length)],
      signatureHtml: form.signatureHtml,
      incoming: {
        host: form.incomingHost.trim(),
        port: Number(form.incomingPort),
        secure: form.incomingSecure,
        username: incomingUsername,
        password: form.incomingPassword
      },
      outgoing: {
        host: (form.outgoingSameAsIncoming ? form.incomingHost : form.outgoingHost).trim(),
        port: Number(form.outgoingPort),
        secure: form.outgoingSecure,
        username: form.outgoingSameAsIncoming ? incomingUsername : form.outgoingUsername || incomingUsername,
        password: form.outgoingSameAsIncoming ? form.incomingPassword : form.outgoingPassword
      }
    }
  }

  const isValid =
    form.email.trim() !== '' &&
    form.incomingHost.trim() !== '' &&
    (isEditing || form.incomingPassword !== '') &&
    (form.outgoingSameAsIncoming
      ? true
      : form.outgoingHost.trim() !== '' && (isEditing || form.outgoingPassword !== ''))

  async function handleTest(): Promise<void> {
    setTesting(true)
    setFormError(null)
    try {
      const result = await testConnection(buildInput(), editingAccount?.id)
      setTestResult(result)
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setTesting(false)
    }
  }

  async function handleSave(): Promise<void> {
    setSaving(true)
    setFormError(null)
    try {
      if (editingAccount) {
        await updateAccount(editingAccount.id, buildInput())
      } else {
        const account = await addAccount(buildInput())
        useMailDataStore.getState().syncAccount(account.id)
      }
      onClose()
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  if (mode === 'picker') {
    return (
      <div className="modal-overlay">
        <div className="modal-box provider-picker">
          <div className="modal-header-row">
            <h2>{t('accountWizard.addTitle')}</h2>
            <button type="button" className="modal-close-btn" title={t('common.close')} onClick={onClose}>
              ✕
            </button>
          </div>

          <div className="provider-list">
            <button
              type="button"
              className="provider-btn"
              disabled={connectingProvider !== null}
              onClick={handleConnectGoogle}
            >
              <span className="provider-btn-icon">🔴</span>
              <span className="provider-btn-label">
                {connectingProvider === 'google' ? t('accountWizard.connectingGoogle') : t('accountWizard.connectGoogle')}
              </span>
            </button>

            <button type="button" className="provider-btn" disabled title={t('accountWizard.comingSoon')}>
              <span className="provider-btn-icon">🔷</span>
              <span className="provider-btn-label">{t('accountWizard.connectMicrosoft')}</span>
            </button>
          </div>

          {providerError && <div className="test-fail form-error">{providerError}</div>}

          <div className="provider-divider">{t('accountWizard.orManual')}</div>

          <button type="button" className="provider-btn" onClick={() => setMode('manual')}>
            <span className="provider-btn-icon">✉️</span>
            <span className="provider-btn-label">{t('accountWizard.manualImapPop3')}</span>
          </button>

          <div className="modal-actions">
            <button type="button" className="reply-btn" onClick={onClose}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header-row">
          <h2>{isEditing ? t('accountWizard.editTitle') : t('accountWizard.addTitle')}</h2>
          <div className="modal-header-actions">
            {!isEditing && (
              <button type="button" className="modal-back-btn" title={t('accountWizard.back')} onClick={() => setMode('picker')}>
                ← {t('accountWizard.back')}
              </button>
            )}
            <button type="button" className="modal-close-btn" title={t('common.close')} onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="form-grid">
          <label>
            {t('accountWizard.displayName')}
            <input
              value={form.displayName}
              onChange={(e) => update('displayName', e.target.value)}
              placeholder="Juan Pérez (Trabajo)"
            />
          </label>

          <label>
            {t('accountWizard.email')}
            <input
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="juan.perez@ejemplo.com"
            />
          </label>

          <div className="protocol-toggle">
            <button
              type="button"
              className={form.protocol === 'imap' ? 'active' : ''}
              onClick={() => setProtocol('imap')}
            >
              IMAP
            </button>
            <button
              type="button"
              className={form.protocol === 'pop3' ? 'active' : ''}
              onClick={() => setProtocol('pop3')}
            >
              POP3
            </button>
          </div>

          <fieldset>
            <legend>{t('accountWizard.incomingServer', { protocol: form.protocol.toUpperCase() })}</legend>
            <label>
              {t('accountWizard.host')}
              <input value={form.incomingHost} onChange={(e) => update('incomingHost', e.target.value)} placeholder="imap.ejemplo.com" />
            </label>
            <div className="field-row">
              <label>
                {t('accountWizard.port')}
                <input value={form.incomingPort} onChange={(e) => update('incomingPort', e.target.value)} />
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={form.incomingSecure} onChange={(e) => setIncomingSecure(e.target.checked)} />
                SSL/TLS
              </label>
            </div>
            <label>
              {t('accountWizard.user')}
              <input value={form.incomingUsername} onChange={(e) => update('incomingUsername', e.target.value)} placeholder={form.email || t('accountWizard.usernamePlaceholder')} />
            </label>
            <label>
              {t('accountWizard.password')}
              <input
                type="password"
                value={form.incomingPassword}
                onChange={(e) => update('incomingPassword', e.target.value)}
                placeholder={isEditing ? t('accountWizard.passwordBlankHint') : ''}
              />
            </label>
          </fieldset>

          <fieldset>
            <legend>{t('accountWizard.outgoingServer')}</legend>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.outgoingSameAsIncoming}
                onChange={(e) => update('outgoingSameAsIncoming', e.target.checked)}
              />
              {t('accountWizard.sameCredentials')}
            </label>
            <label>
              {t('accountWizard.host')}
              <input
                value={form.outgoingSameAsIncoming ? form.incomingHost : form.outgoingHost}
                disabled={form.outgoingSameAsIncoming}
                onChange={(e) => update('outgoingHost', e.target.value)}
                placeholder="smtp.ejemplo.com"
              />
            </label>
            <div className="field-row">
              <label>
                {t('accountWizard.port')}
                <input value={form.outgoingPort} onChange={(e) => update('outgoingPort', e.target.value)} />
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={form.outgoingSecure} onChange={(e) => update('outgoingSecure', e.target.checked)} />
                SSL/TLS
              </label>
            </div>
            {!form.outgoingSameAsIncoming && (
              <>
                <label>
                  {t('accountWizard.user')}
                  <input value={form.outgoingUsername} onChange={(e) => update('outgoingUsername', e.target.value)} placeholder={incomingUsername} />
                </label>
                <label>
                  {t('accountWizard.password')}
                  <input
                    type="password"
                    value={form.outgoingPassword}
                    onChange={(e) => update('outgoingPassword', e.target.value)}
                    placeholder={isEditing ? t('accountWizard.passwordBlankHint') : ''}
                  />
                </label>
              </>
            )}
          </fieldset>

          <fieldset>
            <legend>{t('accountWizard.signature')}</legend>
            <textarea
              className="signature-input"
              value={form.signatureHtml}
              onChange={(e) => update('signatureHtml', e.target.value)}
              rows={5}
              placeholder="<p>Juan Pérez<br>Empresa</p>"
            />
            {form.signatureHtml.trim() && (
              <div className="signature-preview">
                <div className="signature-preview-label">{t('accountWizard.preview')}</div>
                <EmailBodyFrame html={form.signatureHtml} />
              </div>
            )}
          </fieldset>
        </div>

        {testResult && (
          <div className="test-result">
            <div className={testResult.incoming.ok ? 'test-ok' : 'test-fail'}>
              {testResult.incoming.ok ? '✓' : '✗'} {t('accountWizard.incomingResultLabel')} {testResult.incoming.error ? `— ${testResult.incoming.error}` : ''}
            </div>
            <div className={testResult.outgoing.ok ? 'test-ok' : 'test-fail'}>
              {testResult.outgoing.ok ? '✓' : '✗'} {t('accountWizard.outgoingResultLabel')} {testResult.outgoing.error ? `— ${testResult.outgoing.error}` : ''}
            </div>
          </div>
        )}

        {formError && <div className="test-fail form-error">{formError}</div>}

        <div className="modal-actions">
          <button type="button" className="reply-btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="reply-btn" disabled={!isValid || testing} onClick={handleTest}>
            {testing ? t('accountWizard.testing') : t('accountWizard.testConnection')}
          </button>
          <button type="button" className="reply-btn ai-btn" disabled={!isValid || saving} onClick={handleSave}>
            {saving ? t('accountWizard.savingStatus') : isEditing ? t('accountWizard.saveChanges') : t('accountWizard.saveAccount')}
          </button>
        </div>
      </div>
    </div>
  )
}
