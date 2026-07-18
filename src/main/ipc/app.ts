import { app, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { checkForUpdate } from '../services/updateChecker'
import { focusMainWindow } from '../windowManager'

export function registerAppIpc(): void {
  ipcMain.handle(IPC.appGetVersion, () => app.getVersion())
  ipcMain.handle(IPC.appFocusWindow, () => focusMainWindow())
  ipcMain.handle(IPC.updatesCheckLatest, () => checkForUpdate(app.getVersion()))
}
