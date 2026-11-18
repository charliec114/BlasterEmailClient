import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { discardQueuedDraft, listQueuedDrafts, updateQueuedDraft } from '../services/mcpDraftQueue'
import type { ComposeDraft } from '@shared/types'
import { applyMcpConfig, getMcpInfo, regenerateMcpToken } from '../services/mcpServer'

export function registerMcpIpc(): void {
  ipcMain.handle(IPC.mcpGetInfo, () => getMcpInfo())

  ipcMain.handle(IPC.mcpListDrafts, () => listQueuedDrafts())

  ipcMain.handle(IPC.mcpDiscardDraft, (_event, id: string) => discardQueuedDraft(id))

  ipcMain.handle(IPC.mcpUpdateDraft, (_event, id: string, draft: ComposeDraft) => updateQueuedDraft(id, draft))

  // Relee los ajustes guardados (mcpEnabled / mcpPort / mcpAllowSend) y reinicia el servidor.
  ipcMain.handle(IPC.mcpApply, () => applyMcpConfig())

  ipcMain.handle(IPC.mcpRegenerateToken, () => {
    regenerateMcpToken()
    return applyMcpConfig()
  })
}
