import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'
import { IPC } from '@shared/ipc'
import type { SendMailInput } from '@shared/types'
import { getAttachmentContent, listFoldersForAccount, listThreadsForFolder } from '../services/mailRepository'
import { markThreadRead, syncAccount } from '../services/syncService'
import { sendMail } from '../services/mailSend'

export function registerMailIpc(): void {
  ipcMain.handle(IPC.syncRun, (_event, accountId: string) => syncAccount(accountId))

  ipcMain.handle(IPC.mailListFolders, (_event, accountId: string) => listFoldersForAccount(accountId))

  ipcMain.handle(IPC.mailListThreads, (_event, accountId: string, folderId: string) =>
    listThreadsForFolder(accountId, folderId)
  )

  ipcMain.handle(IPC.mailSend, (_event, input: SendMailInput) => sendMail(input))

  ipcMain.handle(IPC.mailMarkThreadRead, (_event, accountId: string, folderId: string, threadId: string) =>
    markThreadRead(accountId, folderId, threadId)
  )

  ipcMain.handle(IPC.mailSaveAttachment, async (event, attachmentId: string): Promise<string | null> => {
    const attachment = getAttachmentContent(attachmentId)
    if (!attachment) throw new Error('Adjunto no encontrado')

    const window = BrowserWindow.fromWebContents(event.sender)
    const result = window
      ? await dialog.showSaveDialog(window, { defaultPath: attachment.filename })
      : await dialog.showSaveDialog({ defaultPath: attachment.filename })

    if (result.canceled || !result.filePath) return null

    await writeFile(result.filePath, attachment.content)
    return result.filePath
  })
}
