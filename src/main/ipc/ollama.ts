import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { getAllSettings } from '../services/settingsRepository'
import {
  assistCompose,
  listOllamaModels,
  suggestSubject,
  summarizeThread,
  type OllamaSettings
} from '../services/ollamaClient'
import { getThreadSummary, saveThreadSummary } from '../services/summaryRepository'

function readOllamaSettings(): OllamaSettings {
  const settings = getAllSettings()
  return {
    baseUrl: settings.ollamaBaseUrl || 'http://localhost:11434',
    model: settings.ollamaModel || '',
    stylePrompt: settings.ollamaStylePrompt || ''
  }
}

export function registerOllamaIpc(): void {
  ipcMain.handle(IPC.ollamaListModels, (_event, baseUrl: string) => listOllamaModels(baseUrl))

  ipcMain.handle(IPC.ollamaGetSummary, (_event, threadKey: string) => getThreadSummary(threadKey))

  ipcMain.handle(
    IPC.ollamaSummarizeThread,
    async (_event, threadKey: string, lastMessageDate: string, threadText: string) => {
      const summary = await summarizeThread(readOllamaSettings(), threadText)
      saveThreadSummary(threadKey, summary, lastMessageDate)
      return summary
    }
  )

  ipcMain.handle(
    IPC.ollamaComposeAssist,
    (_event, instruction: string, context: string, currentBody: string) =>
      assistCompose(readOllamaSettings(), instruction, context, currentBody)
  )

  ipcMain.handle(IPC.ollamaSuggestSubject, (_event, context: string, body: string) =>
    suggestSubject(readOllamaSettings(), context, body)
  )
}
