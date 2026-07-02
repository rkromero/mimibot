'use client'

import { useEffect, useState } from 'react'
import { X, ArrowLeft, Search, Merge, AlertTriangle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/shared/ToastProvider'

type ClienteBase = {
  id: string
  nombre: string
  apellido: string
  telefono: string | null
}

type ClienteOption = {
  id: string
  nombre: string
  apellido: string
  telefono: string | null
  cuit: string | null
  localidad: string | null
}

type FusionPreview = {
  pedidos: number
  movimientosCC: number
  actividades: number
  historialTerritorio: number
  tieneConversacion: boolean
}

type Props = {
  target: ClienteBase
  onClose: () => void
  onSuccess: () => void
}

const inputClass = cn(
  'w-full px-3 py-3 md:py-1.5 text-[16px] md:text-sm rounded-lg md:rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'transition-colors duration-100',
)

function esPosibleDuplicado(c: ClienteOption, target: ClienteBase): boolean {
  const mismoNombre =
    c.nombre.trim().toLowerCase() === target.nombre.trim().toLowerCase() &&
    c.apellido.trim().toLowerCase() === target.apellido.trim().toLowerCase()
  const mismoTelefono = Boolean(c.telefono && target.telefono && c.telefono === target.telefono)
  return mismoNombre || mismoTelefono
}

export default function UnificarClienteModal({ target, onClose, onSuccess }: Props) {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selected, setSelected] = useState<ClienteOption | null>(null)
  const [isFusing, setIsFusing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  // Sin búsqueda, sugerir posibles duplicados: mismo apellido que la base
  const term = debouncedSearch || target.apellido
  const { data: candidatos = [], isLoading: isLoadingList } = useQuery<ClienteOption[]>({
    queryKey: ['fusion-candidatos', target.id, term],
    queryFn: async () => {
      const res = await fetch(`/api/clientes?search=${encodeURIComponent(term)}&limit=20`)
      if (!res.ok) return []
      const json = await res.json() as { data: ClienteOption[] }
      return json.data.filter((c) => c.id !== target.id)
    },
    staleTime: 30_000,
  })

  // Duplicados probables primero (mismo nombre+apellido o mismo teléfono)
  const ordenados = [...candidatos].sort((a, b) =>
    Number(esPosibleDuplicado(b, target)) - Number(esPosibleDuplicado(a, target)),
  )

  const { data: preview, isLoading: isLoadingPreview } = useQuery<FusionPreview>({
    queryKey: ['fusion-preview', selected?.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/clientes/fusionar?sourceId=${selected!.id}`)
      if (!res.ok) throw new Error('Error al calcular el resumen')
      const json = await res.json() as { data: FusionPreview }
      return json.data
    },
    enabled: Boolean(selected),
    staleTime: 10_000,
  })

  async function handleConfirm() {
    if (!selected) return
    setError(null)
    setIsFusing(true)
    try {
      const res = await fetch('/api/admin/clientes/fusionar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: target.id, sourceId: selected.id }),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error ?? 'Error al unificar el cliente')
        return
      }
      toast.success('Cliente unificado')
      onSuccess()
      onClose()
    } catch {
      setError('Error de conexión')
    } finally {
      setIsFusing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:bg-black/50 md:items-center md:justify-center">
      <div className="absolute inset-0 hidden md:block" onClick={onClose} />

      <div className="relative flex flex-col h-full w-full bg-card md:h-auto md:rounded-lg md:border md:border-border md:shadow-xl md:max-w-lg md:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
          <button onClick={onClose} className="md:hidden p-2 -ml-2 text-muted-foreground">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-base md:text-sm font-semibold text-foreground flex-1 flex items-center gap-2">
            <Merge size={16} className="text-muted-foreground" />
            Unificar cliente
          </h2>
          <button onClick={onClose} className="hidden md:block p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Base que se conserva */}
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p className="text-[11px] uppercase tracking-wide font-medium text-primary mb-0.5">
              Base — se conserva
            </p>
            <p className="text-sm font-semibold text-foreground">
              {target.nombre} {target.apellido}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Todos los pedidos, movimientos y actividades del cliente elegido abajo pasarán a esta ficha.
            </p>
          </div>

          {/* Buscador del cliente a absorber */}
          <div>
            <label className="block text-sm md:text-xs text-muted-foreground mb-1.5">
              Cliente a fusionar (quedará dado de baja)
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelected(null) }}
                placeholder="Buscar por nombre, teléfono, CUIT..."
                className={cn(inputClass, 'pl-9')}
              />
            </div>
            {!debouncedSearch && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Sugerencias: posibles duplicados de {target.nombre} {target.apellido}
              </p>
            )}

            <div className="mt-2 border border-border rounded-lg divide-y divide-border max-h-56 overflow-y-auto">
              {isLoadingList && (
                <p className="p-3 text-xs text-muted-foreground">Buscando...</p>
              )}
              {!isLoadingList && ordenados.length === 0 && (
                <p className="p-3 text-xs text-muted-foreground">Sin resultados</p>
              )}
              {ordenados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setSelected(c); setError(null) }}
                  className={cn(
                    'w-full text-left px-3 py-2.5 hover:bg-accent transition-colors',
                    selected?.id === c.id && 'bg-accent',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm text-foreground font-medium">
                      {c.nombre} {c.apellido}
                    </span>
                    {esPosibleDuplicado(c, target) && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        Posible duplicado
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {[c.telefono, c.cuit, c.localidad].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Resumen de lo que se mueve + advertencia */}
          {selected && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <AlertTriangle size={14} />
                Se moverá a la base:
              </p>
              {isLoadingPreview || !preview ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">Calculando...</p>
              ) : (
                <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5 list-disc pl-4">
                  <li>{preview.pedidos} pedido{preview.pedidos === 1 ? '' : 's'}</li>
                  <li>{preview.movimientosCC} movimiento{preview.movimientosCC === 1 ? '' : 's'} de cuenta corriente</li>
                  <li>{preview.actividades} actividad{preview.actividades === 1 ? '' : 'es'}</li>
                  <li>{preview.historialTerritorio} cambio{preview.historialTerritorio === 1 ? '' : 's'} de territorio</li>
                  {preview.tieneConversacion && <li>Su conversación de WhatsApp</li>}
                </ul>
              )}
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                {selected.nombre} {selected.apellido} quedará dado de baja. Esta acción no se puede deshacer.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-card shrink-0">
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!selected || isLoadingPreview || isFusing}
            className="w-full py-3 md:py-2 bg-primary text-primary-foreground rounded-lg md:rounded-md text-base md:text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isFusing ? 'Unificando...' : 'Unificar cliente'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="hidden md:block w-full mt-2 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
