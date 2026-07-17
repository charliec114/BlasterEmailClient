import { ipcMain, dialog, BrowserWindow } from 'electron'
import { statSync } from 'fs'
import { basename } from 'path'
import { IPC } from '@shared/ipc'
import type { AttachmentRef } from '@shared/types'

export function registerDialogIpc(): void {
  ipcMain.handle(IPC.dialogPickFiles, async (event): Promise<AttachmentRef[]> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ['openFile', 'multiSelections'] })
      : await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })

    if (result.canceled) return []

    return result.filePaths.map((path) => ({
      path,
      name: basename(path),
      size: statSync(path).size
    }))
  })
}
