'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/shared/ToastProvider'
import { inputClass } from './InsumosSection'
import type { Receta } from './RecetaCard'

type ClienteOption = { id: string; nombre: string; apellido: string; localidad?: string | null }

// Modal "Duplicar para un cliente": buscador de clientes server-side +
// nombre de la copia. Crea el clon (esCotizador=false) y avisa al padre
// para navegar a editarlo.
export default function DuplicarRecetaModal({
  receta,
  onClose,
  onDone,
}: {
  receta: Receta
  onClose: () => void
  onDone: (nuevaId: string) => void
}) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [cliente, setCliente] = useState<ClienteOption | null>(null)
  const [nombre, setNombre] = useState(receta.nombre)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250)
    return () => clearTimeout(t)
  }, [query])

  const { data: clientes = [], isLoading } = useQuery<ClienteOption[]>({
    queryKey: ['clientes-search-duplicar', debounced],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20', sortBy: 'nombre', sortDir: 'asc' })
      if (debounced.trim()) params.set('search', debounced.trim())
      const res = await fetch(`/api/clientes?${params.toString()}`)
      if (!res.ok) return []
      const json = await res.json() as { data: ClienteOption[] }
      return json.data
    },
    staleTime: 30_000,
  })

  async function handleDuplicar(e: React.FormEvent) {
    e.preventDefault()
    if (!cliente) { setError('Elegí un cliente'); return }
    if (!nombre.trim()) { setError('El nombre es requerido'); return }
    setError(null)
    setIsSaving(true)
    try {
      const res = await fetch(`/api/admin/cotizador/recetas/${receta.id}/duplicar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId: cliente.id, nombre: nombre.trim() }),
      })
      const json = await res.json() as { data?: { id: string }; error?: string }
      if (!res.ok || !json.data) {
        setError(json.error ?? 'Error al duplicar')
        return
      }
      toast.success(`Receta duplicada para ${cliente.nombre} ${cliente.apellido}`)
      onDone(json.data.id)
    } catch {
      setError('Error de conexión')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <button className="absolute inset-0" onClick={onClose} aria-label="Cerrar" />
      <div className="relative bg-card border border-border rounded-lg p-5 w-full max-w-md shadow-xl">
        <h2 className="text-sm font-semibold text-foreground mb-1">Duplicar para un cliente</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Copia "{receta.nombre}" ({receta.gramaje} g) con sus componentes y packaging como receta del cliente.
        </p>
        <form onSubmit={handleDuplicar} className="space-y-3">
          {cliente ? (
            <div className="flex items-center justify-between border border-border rounded-md px-3 py-2">
              <span className="text-sm text-foreground truncate">{cliente.nombre} {cliente.apellido}</span>
              <button type="button" onClick={() => setCliente(null)} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Cambiar cliente">
                <X size={14} />
              </button>
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar cliente..."
                  className={cn(inputClass, 'pl-8')}
                />
              </div>
              <div className="mt-1 max-h-44 overflow-y-auto border border-border rounded-md divide-y divide-border">
                {isLoading ? (
                  <p className="text-xs text-muted-foreground p-2">Buscando...</p>
                ) : clientes.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">Sin resultados</p>
                ) : clientes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCliente(c)}
                    className="w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
                  >
                    {c.nombre} {c.apellido}
                    {c.localidad && <span className="text-xs text-muted-foreground"> — {c.localidad}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Nombre de la copia *</label>
            <input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Duplicando...' : 'Duplicar receta'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
