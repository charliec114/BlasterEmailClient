import { getDb } from '../db'
import type { StoredSummary } from '@shared/types'

export function getThreadSummary(threadKey: string): StoredSummary | null {
  const row = getDb()
    .prepare('SELECT summary, last_message_date, generated_at FROM thread_summaries WHERE thread_key = ?')
    .get(threadKey) as { summary: string; last_message_date: string; generated_at: string } | undefined

  if (!row) return null
  return { summary: row.summary, lastMessageDate: row.last_message_date, generatedAt: row.generated_at }
}

export function saveThreadSummary(threadKey: string, summary: string, lastMessageDate: string): void {
  getDb()
    .prepare(
      `INSERT INTO thread_summaries (thread_key, summary, last_message_date, generated_at)
       VALUES (@threadKey, @summary, @lastMessageDate, @generatedAt)
       ON CONFLICT(thread_key) DO UPDATE SET
         summary = excluded.summary,
         last_message_date = excluded.last_message_date,
         generated_at = excluded.generated_at`
    )
    .run({ threadKey, summary, lastMessageDate, generatedAt: new Date().toISOString() })
}
