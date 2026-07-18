import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { listOllamaModels } from '../services/ollamaClient'
import { assistCompose, suggestSubject, summarizeThread } from '../services/aiRouter'
import { getThreadSummary, saveThreadSummary } from '../services/summaryRepository'

export function registerOllamaIpc(): void {
  ipcMain.handle(IPC.ollamaListModels, (_event, baseUrl: string) => listOllamaModels(baseUrl))

  ipcMain.handle(IPC.ollamaGetSummary, (_event, threadKey: string) => getThreadSummary(threadKey))

  ipcMain.handle(
    IPC.ollamaSummarizeThread,
    async (_event, threadKey: string, lastMessageDate: string, threadText: string) => {
      const summary = await summarizeThread(threadText)
      saveThreadSummary(threadKey, summary, lastMessageDate)
      return summary
    }
  )

  ipcMain.handle(IPC.ollamaComposeAssist, (_event, instruction: string, context: string, currentBody: string) =>
    assistCompose(instruction, context, currentBody)
  )

  ipcMain.handle(IPC.ollamaSuggestSubject, (_event, context: string, body: string) => suggestSubject(context, body))
}
