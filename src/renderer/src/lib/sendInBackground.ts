import { useComposeStore } from '../store/useComposeStore'
import { useMailDataStore } from '../store/useMailDataStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useToastStore } from '../store/useToastStore'
import { useQueuedDraftsStore } from '../store/useQueuedDraftsStore'
import { useScheduledMailStore } from '../store/useScheduledMailStore'
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
    const result = await window.api.mail.send(input)
    toasts.dismiss(sendingId)
    // Enviado o en la cola de salida: en ambos casos el borrador del MCP (si venía de ahí) ya cumplió.
    if (draft.queuedDraftId) void useQueuedDraftsStore.getState().discard(draft.queuedDraftId)
    if (result.queued) {
      // Sin conexión: quedó en la cola de salida (se ve en Programados) y sale sola al volver internet.
      toasts.show({ kind: 'info', message: translate(language, 'composeModal.queuedOfflineToast') }, 8000)
      void useScheduledMailStore.getState().fetch()
      return
    }
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
