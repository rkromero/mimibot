'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import BottomSheet from '@/components/shared/BottomSheet'

type Item = {
  id: string
  label: string
  sublabel?: string
  badge?: string
}

type Props = {
  open: boolean
  onClose: () => void
  placeholder?: string
  items: Item[]
  onSelect: (id: string) => void
  isLoading?: boolean
  emptyLabel?: string
}

export default function SearchSheet({
  open,
  onClose,
  placeholder = 'Buscar...',
  items,
  onSelect,
  isLoading = false,
  emptyLabel,
}: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Autofocus when opened
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100)
      return () => clearTimeout(timer)
    } else {
      setQuery('')
    }
  }, [open])

  const filtered = query.trim()
    ? items.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.sublabel?.toLowerCase().includes(query.toLowerCase()),
      )
    : items

  function handleSelect(id: string) {
    onSelect(id)
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* Search input */}
      <div className="flex items-center gap-2 border border-border rounded-xl px-3 py-2.5 bg-muted mb-3">
        <Search size={18} className="text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="flex-1 text-[16px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
          inputMode="search"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
            className="p-1 text-muted-foreground"
            aria-label="Limpiar búsqueda"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex flex-col gap-0">
        {isLoading ? (
          // Skeleton rows
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse bg-muted h-14 rounded-xl mb-2"
            />
          ))
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {emptyLabel ?? 'Sin resultados'}
          </p>
        ) : (
          filtered.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={cn(
                'w-full flex items-start gap-3 p-4 rounded-xl active:bg-accent transition-colors min-h-[56px]',
              )}
            >
              <div className="flex-1 text-left">
                <p className="text-base font-medium text-foreground">{item.label}</p>
                {item.sublabel && (
                  <p className="text-sm text-muted-foreground">{item.sublabel}</p>
                )}
              </div>
              {item.badge && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0 mt-0.5">
                  {item.badge}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </BottomSheet>
  )
}
