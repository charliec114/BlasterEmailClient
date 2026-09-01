import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { ScheduleMailInput } from '@shared/types'
import { cancelScheduledMail, listScheduledMail, scheduleMail } from '../services/scheduledMailRepository'
import { sendScheduledMailNow } from '../services/scheduleService'

export function registerScheduledMailIpc(): void {
  ipcMain.handle(IPC.scheduledMailList, () => listScheduledMail())

  ipcMain.handle(IPC.scheduledMailCreate, (_event, input: ScheduleMailInput) => scheduleMail(input))

  ipcMain.handle(IPC.scheduledMailCancel, (_event, id: string) => cancelScheduledMail(id))

  ipcMain.handle(IPC.scheduledMailSendNow, (_event, id: string) => sendScheduledMailNow(id))
}
