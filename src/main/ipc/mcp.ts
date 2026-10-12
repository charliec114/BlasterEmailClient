import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { applyMcpConfig, getMcpInfo, regenerateMcpToken } from '../services/mcpServer'

export function registerMcpIpc(): void {
  ipcMain.handle(IPC.mcpGetInfo, () => getMcpInfo())

  // Relee los ajustes guardados (mcpEnabled / mcpPort / mcpAllowSend) y reinicia el servidor.
  ipcMain.handle(IPC.mcpApply, () => applyMcpConfig())

  ipcMain.handle(IPC.mcpRegenerateToken, () => {
    regenerateMcpToken()
    return applyMcpConfig()
  })
}
