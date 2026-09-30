import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { assistCompose, listModels, suggestSubject, summarizeThread } from '../services/aiRouter'
import { getThreadSummary, saveThreadSummary } from '../services/summaryRepository'

export function registerAiIpc(): void {
  ipcMain.handle(IPC.aiListModels, (_event, baseUrl: string) => listModels(baseUrl))

  ipcMain.handle(IPC.aiGetSummary, (_event, threadKey: string) => getThreadSummary(threadKey))

  ipcMain.handle(
    IPC.aiSummarizeThread,
    async (_event, threadKey: string, lastMessageDate: string, threadText: string) => {
      const summary = await summarizeThread(threadText)
      saveThreadSummary(threadKey, summary, lastMessageDate)
      return summary
    }
  )

  ipcMain.handle(IPC.aiComposeAssist, (_event, instruction: string, context: string, currentBody: string) =>
    assistCompose(instruction, context, currentBody)
  )

  ipcMain.handle(IPC.aiSuggestSubject, (_event, context: string, body: string) => suggestSubject(context, body))
}
