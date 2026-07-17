import type { MailFolder } from '@shared/types'

export function mapFolderKind(path: string, specialUse: string | undefined, name: string): MailFolder['kind'] {
  if (path.toUpperCase() === 'INBOX') return 'inbox'

  switch (specialUse) {
    case '\\Inbox':
      return 'inbox'
    case '\\Sent':
      return 'sent'
    case '\\Drafts':
      return 'drafts'
    case '\\Trash':
      return 'trash'
    case '\\Archive':
    case '\\All':
      return 'archive'
    default:
      break
  }

  const lower = name.toLowerCase()
  if (/sent|enviad/.test(lower)) return 'sent'
  if (/draft|borrador/.test(lower)) return 'drafts'
  if (/trash|papelera|deleted/.test(lower)) return 'trash'
  if (/archive|archivo/.test(lower)) return 'archive'
  return 'custom'
}

export const SYNCED_FOLDER_KINDS: ReadonlySet<MailFolder['kind']> = new Set([
  'inbox',
  'sent',
  'drafts',
  'trash',
  'archive'
])
