import { randomUUID } from 'crypto'
import { getDb } from '../db'
import type { Contact } from '@shared/types'

interface ContactRow {
  id: string
  email: string
  name: string | null
  last_interaction_at: string
  interaction_count: number
}

function rowToContact(row: ContactRow): Contact {
  return {
    email: row.email,
    name: row.name,
    lastInteractionAt: row.last_interaction_at,
    interactionCount: row.interaction_count
  }
}

export function upsertContact(email: string, name: string | null, interactionDate: string): void {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail || !normalizedEmail.includes('@')) return

  const db = getDb()
  const existing = db.prepare('SELECT * FROM contacts WHERE email = ?').get(normalizedEmail) as
    | ContactRow
    | undefined

  if (!existing) {
    db.prepare(
      'INSERT INTO contacts (id, email, name, last_interaction_at, interaction_count) VALUES (?, ?, ?, ?, 1)'
    ).run(randomUUID(), normalizedEmail, name || null, interactionDate)
    return
  }

  const lastInteractionAt = interactionDate > existing.last_interaction_at ? interactionDate : existing.last_interaction_at
  db.prepare(
    'UPDATE contacts SET name = ?, last_interaction_at = ?, interaction_count = interaction_count + 1 WHERE id = ?'
  ).run(name || existing.name, lastInteractionAt, existing.id)
}

export function backfillContactsFromMessages(): void {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT from_email, from_name, MAX(date) as last_date, COUNT(*) as cnt
       FROM messages WHERE from_email IS NOT NULL AND from_email != ''
       GROUP BY from_email`
    )
    .all() as { from_email: string; from_name: string | null; last_date: string; cnt: number }[]

  for (const row of rows) {
    const normalizedEmail = row.from_email.trim().toLowerCase()
    const existing = db.prepare('SELECT id, interaction_count FROM contacts WHERE email = ?').get(normalizedEmail) as
      | { id: string; interaction_count: number }
      | undefined

    if (!existing) {
      db.prepare(
        'INSERT INTO contacts (id, email, name, last_interaction_at, interaction_count) VALUES (?, ?, ?, ?, ?)'
      ).run(randomUUID(), normalizedEmail, row.from_name || null, row.last_date, row.cnt)
    } else if (existing.interaction_count < row.cnt) {
      db.prepare('UPDATE contacts SET interaction_count = ? WHERE id = ?').run(row.cnt, existing.id)
    }
  }
}

export function searchContacts(query: string, limit = 8): Contact[] {
  const like = `%${query.trim().toLowerCase()}%`
  const rows = getDb()
    .prepare(
      `SELECT * FROM contacts WHERE email LIKE ? OR lower(name) LIKE ?
       ORDER BY interaction_count DESC, last_interaction_at DESC LIMIT ?`
    )
    .all(like, like, limit) as ContactRow[]
  return rows.map(rowToContact)
}

export function listContacts(): Contact[] {
  const rows = getDb()
    .prepare('SELECT * FROM contacts ORDER BY last_interaction_at DESC')
    .all() as ContactRow[]
  return rows.map(rowToContact)
}

export function deleteContact(email: string): void {
  getDb().prepare('DELETE FROM contacts WHERE email = ?').run(email.trim().toLowerCase())
}

export function updateContact(currentEmail: string, name: string, newEmail: string): Contact {
  const db = getDb()
  const normalizedCurrent = currentEmail.trim().toLowerCase()
  const normalizedNew = newEmail.trim().toLowerCase()

  const row = db.prepare('SELECT * FROM contacts WHERE email = ?').get(normalizedCurrent) as ContactRow | undefined
  if (!row) throw new Error('Contacto no encontrado')

  if (normalizedNew !== normalizedCurrent) {
    const clash = db.prepare('SELECT id FROM contacts WHERE email = ?').get(normalizedNew)
    if (clash) throw new Error('Ya existe un contacto con ese email')
  }

  const finalName = name.trim() || null
  db.prepare('UPDATE contacts SET email = ?, name = ? WHERE id = ?').run(normalizedNew, finalName, row.id)

  return rowToContact({ ...row, email: normalizedNew, name: finalName })
}
