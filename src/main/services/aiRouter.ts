import { getAllSettings } from './settingsRepository'
import { getApiKey } from './apiKeysRepository'
import { pendingQueryPrompt, type PendingChatTurn } from './aiPrompts'
import * as ollama from './ollamaClient'
import * as openai from './openaiClient'
import * as gemini from './geminiClient'
import * as anthropic from './anthropicClient'

export type AiProvider = 'ollama' | 'openai' | 'gemini' | 'anthropic'

interface AiClient {
  summarizeThread(settings: never, threadText: string): Promise<string>
  assistCompose(settings: never, instruction: string, context: string, currentBody: string): Promise<string>
  suggestSubject(settings: never, context: string, body: string): Promise<string>
  answerFreeform(settings: never, prompt: string): Promise<string>
}

function activeProvider(): AiProvider {
  const provider = getAllSettings().aiProvider as AiProvider | undefined
  return provider && ['ollama', 'openai', 'gemini', 'anthropic'].includes(provider) ? provider : 'ollama'
}

function buildSettings(provider: AiProvider): unknown {
  const settings = getAllSettings()
  const stylePrompt = settings.aiStylePrompt || ''

  if (provider === 'ollama') {
    return { baseUrl: settings.ollamaBaseUrl || 'http://localhost:11434', model: settings.ollamaModel || '', stylePrompt }
  }
  if (provider === 'openai') {
    return { apiKey: getApiKey('openai') || '', model: settings.openaiModel || '', stylePrompt }
  }
  if (provider === 'gemini') {
    return { apiKey: getApiKey('gemini') || '', model: settings.geminiModel || '', stylePrompt }
  }
  return { apiKey: getApiKey('anthropic') || '', model: settings.anthropicModel || '', stylePrompt }
}

function clientFor(provider: AiProvider): AiClient {
  if (provider === 'ollama') return ollama as unknown as AiClient
  if (provider === 'openai') return openai as unknown as AiClient
  if (provider === 'gemini') return gemini as unknown as AiClient
  return anthropic as unknown as AiClient
}

export async function summarizeThread(threadText: string): Promise<string> {
  const provider = activeProvider()
  return clientFor(provider).summarizeThread(buildSettings(provider) as never, threadText)
}

export async function assistCompose(instruction: string, context: string, currentBody: string): Promise<string> {
  const provider = activeProvider()
  return clientFor(provider).assistCompose(buildSettings(provider) as never, instruction, context, currentBody)
}

export async function suggestSubject(context: string, body: string): Promise<string> {
  const provider = activeProvider()
  return clientFor(provider).suggestSubject(buildSettings(provider) as never, context, body)
}

export async function answerPendingQuery(digestText: string, history: PendingChatTurn[], question: string): Promise<string> {
  const provider = activeProvider()
  const settings = buildSettings(provider) as { stylePrompt: string }
  const prompt = pendingQueryPrompt(settings.stylePrompt, digestText, history, question)
  return clientFor(provider).answerFreeform(settings as never, prompt)
}
