import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { PendingAskInput, PendingAskResult } from '@shared/types'
import { buildPendingDigest } from '../services/pendingDigest'
import { answerPendingQuery } from '../services/aiRouter'

export function registerPendingIpc(): void {
  ipcMain.handle(IPC.pendingAsk, async (_event, input: PendingAskInput): Promise<PendingAskResult> => {
    const digest = await buildPendingDigest({
      accountIds: input.accountIds,
      fromDate: input.fromDate,
      toDate: input.toDate
    })

    if (!digest.text) {
      return {
        answer: 'No encontré emails en ese rango de fechas y cuentas.',
        threadCount: 0,
        messageCount: 0,
        truncated: false,
        threads: []
      }
    }

    const answer = await answerPendingQuery(digest.text, input.history, input.question)
    return {
      answer,
      threadCount: digest.threadCount,
      messageCount: digest.messageCount,
      truncated: digest.truncated,
      threads: digest.threads
    }
  })
}
