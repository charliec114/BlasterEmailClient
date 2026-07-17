import { useEffect, useRef, useState } from 'react'
import type { Contact } from '@shared/types'

function lastFragment(value: string): string {
  const parts = value.split(/[,;]/)
  return parts[parts.length - 1].trim()
}

interface AddressInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function AddressInput({ value, onChange, placeholder }: AddressInputProps) {
  const [suggestions, setSuggestions] = useState<Contact[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const query = lastFragment(value)
    if (query.length < 2) {
      setSuggestions([])
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      const results = await window.api.contacts.search(query)
      if (!cancelled) {
        setSuggestions(results)
        setOpen(results.length > 0)
      }
    }, 150)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [value])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function selectSuggestion(contact: Contact): void {
    const separatorIndex = Math.max(value.lastIndexOf(','), value.lastIndexOf(';'))
    const prefix = separatorIndex >= 0 ? `${value.slice(0, separatorIndex + 1)} ` : ''
    onChange(`${prefix}${contact.email}, `)
    setOpen(false)
  }

  return (
    <div className="address-input" ref={containerRef}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
      />
      {open && suggestions.length > 0 && (
        <ul className="address-suggestions">
          {suggestions.map((contact) => (
            <li key={contact.email}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => selectSuggestion(contact)}>
                <span className="address-suggestion-name">{contact.name || contact.email}</span>
                {contact.name && <span className="address-suggestion-email">{contact.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
