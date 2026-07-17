import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { getAllSettings, setSetting } from '../services/settingsRepository'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC.settingsGetAll, () => getAllSettings())
  ipcMain.handle(IPC.settingsSet, (_event, key: string, value: string) => setSetting(key, value))
}
