import { useEffect, useState } from 'react'
import { useT } from '../i18n/useT'
import type { Thread } from '@shared/types'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function buildThreadText(thread: Thread): string {
  return thread.messages
    .map((m) => `De: ${m.from.name} <${m.from.email}>\n${m.bodyText.trim()}`)
    .join('\n\n---\n\n')
}

interface ThreadSummaryCardProps {
  thread: Thread
}

export default function ThreadSummaryCard({ thread }: ThreadSummaryCardProps) {
  const { t } = useT()
  const [summary, setSummary] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    window.api.ollama.getSummary(thread.id).then((cached) => {
      if (cached) {
        setSummary(cached.summary)
        setStale(cached.lastMessageDate < thread.lastMessageDate)
      } else {
        setSummary(null)
        setStale(false)
      }
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id])

  async function handleGenerate(): Promise<void> {
    setGenerating(true)
    setError(null)
    try {
      const result = await window.api.ollama.summarizeThread(thread.id, thread.lastMessageDate, buildThreadText(thread))
      setSummary(result)
      setStale(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return null

  return (
    <div className="ai-summary-card">
      <span className="ai-summary-label">{t('threadSummaryCard.label')}</span>

      {summary && <p>{summary}</p>}

      {summary && stale && <p className="ai-summary-stale">{t('threadSummaryCard.stale')}</p>}

      {error && <p className="test-fail">{t('threadSummaryCard.error', { error })}</p>}

      <button type="button" className="reply-btn ai-btn ai-summary-btn" disabled={generating} onClick={handleGenerate}>
        {generating ? t('threadSummaryCard.generating') : summary ? t('threadSummaryCard.regenerate') : t('threadSummaryCard.generate')}
      </button>
    </div>
  )
}
