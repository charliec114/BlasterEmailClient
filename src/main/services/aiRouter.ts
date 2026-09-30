import { getAllSettings } from './settingsRepository'
import { getApiKey } from './apiKeysRepository'
import { pendingQueryPrompt, type PendingChatTurn } from './aiPrompts'
import * as ai from './aiClient'

export const AI_API_KEY_PROVIDER = 'ai'

function currentSettings(): ai.AiSettings {
  const settings = getAllSettings()
  return {
    baseUrl: settings.aiBaseUrl || '',
    model: settings.aiModel || '',
    apiKey: getApiKey(AI_API_KEY_PROVIDER) || '',
    stylePrompt: settings.aiStylePrompt || ''
  }
}

export function listModels(baseUrl: string): Promise<string[]> {
  return ai.listAiModels(baseUrl, getApiKey(AI_API_KEY_PROVIDER) || '')
}

export async function summarizeThread(threadText: string): Promise<string> {
  return ai.summarizeThread(currentSettings(), threadText)
}

export async function assistCompose(instruction: string, context: string, currentBody: string): Promise<string> {
  return ai.assistCompose(currentSettings(), instruction, context, currentBody)
}

export async function suggestSubject(context: string, body: string): Promise<string> {
  return ai.suggestSubject(currentSettings(), context, body)
}

export async function answerPendingQuery(digestText: string, history: PendingChatTurn[], question: string): Promise<string> {
  const settings = currentSettings()
  const prompt = pendingQueryPrompt(settings.stylePrompt, digestText, history, question)
  return ai.answerFreeform(settings, prompt)
}
