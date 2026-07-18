import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { getApiKeyStatus, setApiKey } from '../services/apiKeysRepository'

export function registerApiKeysIpc(): void {
  ipcMain.handle(IPC.apiKeysSet, (_event, provider: string, key: string) => setApiKey(provider, key))
  ipcMain.handle(IPC.apiKeysStatus, () => getApiKeyStatus())
}
