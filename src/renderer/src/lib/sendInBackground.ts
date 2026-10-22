import { useComposeStore } from '../store/useComposeStore'
import { useMailDataStore } from '../store/useMailDataStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useToastStore } from '../store/useToastStore'
import { translate } from '../i18n/useT'
import { playSentMailSound } from './sound'
import type { ComposeDraft, SendMailInput } from '@shared/types'

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  // Electron antepone "Error invoking remote method 'x': Error: " a los errores de IPC.
  return message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')
}

// Envío "optimista": el redactor ya se cerró y el usuario sigue trabajando mientras el
// mensaje sale (SMTP + copia en Enviados pueden tardar varios segundos). Si falla, se reabre el
// redactor con todo lo que había escrito más el motivo, para que no se pierda nada.
export async function sendInBackground(input: SendMailInput, draft: ComposeDraft): Promise<void> {
  const language = useSettingsStore.getState().language
  const toasts = useToastStore.getState()
  const sendingId = toasts.show({ kind: 'info', message: translate(language, 'composeModal.sendingToast') }, 0)

  try {
    await window.api.mail.send(input)
    toasts.dismiss(sendingId)
    toasts.show({ kind: 'success', message: translate(language, 'composeModal.sentToast') })
    if (useSettingsStore.getState().soundEnabled) playSentMailSound()
    useMailDataStore.getState().syncAccount(input.accountId)
  } catch (error) {
    toasts.dismiss(sendingId)
    const reopened: ComposeDraft = { ...draft, error: errorMessage(error) }
    const compose = useComposeStore.getState()
    if (!compose.draft) {
      compose.openCompose(reopened)
    } else {
      // El usuario ya abrió otro mensaje: no se le pisa lo que escribe; queda un aviso para reabrir.
      toasts.show(
        {
          kind: 'error',
          message: `${translate(language, 'composeModal.sendFailedToast')}: ${reopened.error}`,
          action: {
            label: translate(language, 'composeModal.reopenDraft'),
            onClick: () => {
              if (!useComposeStore.getState().draft) useComposeStore.getState().openCompose(reopened)
            }
          }
        },
        0
      )
    }
  }
}
