'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Search } from 'lucide-react'

type User = { id: string; name: string | null; email: string; role: string; avatarColor: string }
type Props = { territorioId: string; onClose: () => void; onDone: () => void }

export default function AsignarAgenteModal({ territorioId, onClose, onDone }: Props) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: usuarios = [] } = useQuery<User[]>({
    queryKey: ['usuarios-agentes'],
    queryFn: async () => {
      const res = await fetch('/api/users?role=agent')
      if (!res.ok) return []
      return (await res.json() as { data: User[] }).data
    },
  })

  const filtered = usuarios.filter((u) => {
    const q = search.toLowerCase()
    return (u.name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  })

  const handleConfirm = async () => {
    if (!selected) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/territorios/${territorioId}/agente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agenteId: selected }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) { setError(json.error ?? 'Error al asignar'); return }
      onDone()
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Asignar agente</h3>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar agente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="max-h-52 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sin agentes disponibles</p>
          ) : filtered.map((u) => (
            <button
              key={u.id}
              onClick={() => setSelected(u.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                selected === u.id ? 'bg-primary/10 text-primary' : 'hover:bg-accent text-foreground'
              }`}
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
                style={{ backgroundColor: u.avatarColor }}
              >
                {(u.name ?? u.email).slice(0, 2).toUpperCase()}
              </span>
              <div className="text-left">
                <p className="font-medium">{u.name ?? 'Sin nombre'}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || loading}
            className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Asignando...' : 'Asignar'}
          </button>
        </div>
      </div>
    </div>
  )
}
