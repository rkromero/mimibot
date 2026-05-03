'use client'

import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LeadFilters } from '@/lib/validations/lead'
import type { Session } from 'next-auth'
import type { User } from '@/types/db'

type Props = {
  user: Session['user']
  filters: LeadFilters
  onChange: (f: LeadFilters) => void
}

export default function PipelineFilters({ user, filters, onChange }: Props) {
  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await fetch('/api/users?role=agent')
      if (!res.ok) return []
      const json = await res.json() as { data: User[] }
      return json.data
    },
    enabled: user.role === 'admin',
    staleTime: 60_000,
  })

  const hasActiveFilters =
    filters.agentId || filters.tagId || filters.source || filters.search

  return (
    <div className="flex items-center gap-2 px-4 h-11 border-b border-border bg-background shrink-0">
      {/* Búsqueda por texto */}
      <div className="relative flex-1 max-w-xs">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar lead..."
          value={filters.search ?? ''}
          onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
          className={cn(
            'w-full pl-8 pr-3 py-1.5 text-sm rounded-md border',
            'border-border bg-background text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring',
            'transition-colors duration-100',
          )}
        />
      </div>

      {/* Filtro por agente (solo admin) */}
      {user.role === 'admin' && (
        <select
          value={filters.agentId ?? ''}
          onChange={(e) => onChange({ ...filters, agentId: e.target.value || undefined })}
          className={cn(
            'py-1.5 pl-2.5 pr-7 text-sm rounded-md border',
            'border-border bg-background text-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        >
          <option value="">Todos los agentes</option>
          {agentsQuery.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name ?? a.email}
            </option>
          ))}
        </select>
      )}

      {/* Filtro por fuente */}
      <select
        value={filters.source ?? ''}
        onChange={(e) =>
          onChange({
            ...filters,
            source: (e.target.value as LeadFilters['source']) || undefined,
          })
        }
        className={cn(
          'py-1.5 pl-2.5 pr-7 text-sm rounded-md border',
          'border-border bg-background text-foreground',
          'focus:outline-none focus:ring-1 focus:ring-ring',
        )}
      >
        <option value="">Todas las fuentes</option>
        <option value="whatsapp">WhatsApp</option>
        <option value="landing">Landing</option>
        <option value="manual">Manual</option>
      </select>

      {/* Limpiar filtros */}
      {hasActiveFilters && (
        <button
          onClick={() => onChange({})}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors duration-100"
        >
          <X size={12} />
          Limpiar
        </button>
      )}
    </div>
  )
}
