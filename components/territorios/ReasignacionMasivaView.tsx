'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, CheckSquare, Square, ArrowRightLeft, AlertTriangle } from 'lucide-react'

type Cliente = {
  id: string
  nombre: string
  apellido: string
  territorioId: string | null
  territorioNombre: string | null
  asignadoNombre: string | null
}

type Territorio = {
  id: string
  nombre: string
  esLegacy: boolean
}

export default function ReasignacionMasivaView() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filtroTerritorio, setFiltroTerritorio] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [destino, setDestino] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ movidos: number; errores: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: clientes = [], refetch } = useQuery<Cliente[]>({
    queryKey: ['clientes-reasignacion'],
    queryFn: async () => {
      const res = await fetch('/api/clientes')
      if (!res.ok) return []
      return (await res.json() as { data: Cliente[] }).data
    },
    staleTime: 0,
  })

  const { data: territorios = [] } = useQuery<Territorio[]>({
    queryKey: ['territorios'],
    queryFn: async () => {
      const res = await fetch('/api/territorios')
      if (!res.ok) return []
      return (await res.json() as { data: Territorio[] }).data
    },
  })

  const filtered = useMemo(() => {
    return clientes.filter((c) => {
      const matchSearch = !search.trim() ||
        `${c.nombre} ${c.apellido}`.toLowerCase().includes(search.toLowerCase())
      const matchTerritorio = !filtroTerritorio ||
        (filtroTerritorio === '__sin__' ? !c.territorioId : c.territorioId === filtroTerritorio)
      return matchSearch && matchTerritorio
    })
  }, [clientes, search, filtroTerritorio])

  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id))

  const toggleAll = () => {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev)
        filtered.forEach((c) => next.delete(c.id))
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        filtered.forEach((c) => next.add(c.id))
        return next
      })
    }
  }

  const handleReasignar = async () => {
    if (selected.size === 0 || !destino) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/clientes/reasignacion-masiva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteIds: [...selected], nuevoTerritorioId: destino }),
      })
      const json = await res.json() as { data?: { movidos: number; errores: string[] }; error?: string }
      if (!res.ok) { setError(json.error ?? 'Error al reasignar'); return }
      setResult(json.data!)
      setSelected(new Set())
      void refetch()
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="p-4 md:p-6 pb-24 md:pb-6 space-y-4 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Reasignación masiva</h1>
            <p className="text-sm text-muted-foreground">Mové clientes de un territorio a otro</p>
          </div>
        </div>

        {/* Resultado de operación */}
        {result && (
          <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md text-sm text-green-800 dark:text-green-300">
            <ArrowRightLeft size={15} className="shrink-0 mt-0.5" />
            <div>
              <p>{result.movidos} cliente{result.movidos !== 1 ? 's' : ''} reasignado{result.movidos !== 1 ? 's' : ''} correctamente.</p>
              {result.errores.length > 0 && (
                <p className="text-amber-700 dark:text-amber-400 mt-0.5">{result.errores.length} error(es): {result.errores.join(', ')}</p>
              )}
            </div>
          </div>
        )}

        {/* Panel de acción sticky */}
        {selected.size > 0 && (
          <div className="sticky top-4 z-10 bg-card border border-primary/30 shadow-lg rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <span className="text-sm font-medium text-foreground">{selected.size} cliente{selected.size !== 1 ? 's' : ''} seleccionado{selected.size !== 1 ? 's' : ''}</span>
            <div className="flex items-center gap-2 flex-1">
              <select
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                className="flex-1 text-sm border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Seleccioná territorio destino</option>
                {territorios.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}{t.esLegacy ? ' (legacy)' : ''}</option>
                ))}
              </select>
              <button
                onClick={handleReasignar}
                disabled={!destino || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
              >
                <ArrowRightLeft size={14} />
                {loading ? 'Procesando...' : 'Reasignar'}
              </button>
            </div>
            {error && <p className="text-xs text-destructive w-full">{error}</p>}
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={filtroTerritorio}
            onChange={(e) => setFiltroTerritorio(e.target.value)}
            className="text-sm border border-border rounded-md px-2 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todos los territorios</option>
            <option value="__sin__">Sin territorio asignado</option>
            {territorios.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>

        {/* Tabla */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/30">
            <button onClick={toggleAll} className="p-0.5 text-muted-foreground hover:text-foreground">
              {allSelected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
            </button>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Cliente ({filtered.length})
            </span>
            <span className="ml-auto text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:block">Territorio actual</span>
          </div>
          <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin clientes que coincidan</p>
            ) : (
              filtered.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors">
                  <button
                    onClick={() => setSelected((prev) => {
                      const next = new Set(prev)
                      next.has(c.id) ? next.delete(c.id) : next.add(c.id)
                      return next
                    })}
                    className="p-0.5 text-muted-foreground hover:text-foreground shrink-0"
                  >
                    {selected.has(c.id)
                      ? <CheckSquare size={16} className="text-primary" />
                      : <Square size={16} />
                    }
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.nombre} {c.apellido}</p>
                    {c.asignadoNombre && (
                      <p className="text-xs text-muted-foreground truncate">{c.asignadoNombre}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground hidden sm:block truncate max-w-[140px]">
                    {c.territorioNombre ?? <span className="italic text-amber-600 dark:text-amber-400 flex items-center gap-1"><AlertTriangle size={10} />Sin territorio</span>}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
