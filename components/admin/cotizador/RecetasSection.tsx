'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import ConfirmDeleteModal from '@/components/shared/ConfirmDeleteModal'
import { useToast } from '@/components/shared/ToastProvider'
import { inputClass, type Insumo } from './InsumosSection'
import RecetaCard, { type ConfigGlobal, type Receta } from './RecetaCard'
import DuplicarRecetaModal from './DuplicarRecetaModal'

const SIN_CONFIG: ConfigGlobal = { margenPct: null, alfajoresPorCaja: null }

export default function RecetasSection() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: recetas = [], isLoading } = useQuery<Receta[]>({
    queryKey: ['cotizador-recetas'],
    queryFn: async () => {
      const res = await fetch('/api/admin/cotizador/recetas')
      if (!res.ok) throw new Error('Error al cargar recetas')
      const json = await res.json() as { data: Receta[] }
      return json.data
    },
  })

  const { data: insumos = [] } = useQuery<Insumo[]>({
    queryKey: ['cotizador-insumos'],
    queryFn: async () => {
      const res = await fetch('/api/admin/cotizador/insumos')
      if (!res.ok) throw new Error('Error al cargar insumos')
      const json = await res.json() as { data: Insumo[] }
      return json.data
    },
  })

  // Margen y alfajores/caja globales: el form de cada receta los muestra
  // como valores heredados cuando el campo propio queda vacío
  const { data: config = SIN_CONFIG } = useQuery<ConfigGlobal>({
    queryKey: ['cotizador-config-global'],
    queryFn: async () => {
      const res = await fetch('/api/admin/cotizador/config')
      if (!res.ok) return SIN_CONFIG
      const json = await res.json() as { data?: { config?: { margenPct?: string; alfajoresPorCaja?: number } } }
      const c = json.data?.config
      return {
        margenPct: c?.margenPct != null ? Number(c.margenPct) : null,
        alfajoresPorCaja: c?.alfajoresPorCaja ?? null,
      }
    },
    staleTime: 60_000,
  })

  const [showCreate, setShowCreate] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: '', gramaje: '', esCotizador: true })
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [duplicando, setDuplicando] = useState<Receta | null>(null)
  const [deleting, setDeleting] = useState<Receta | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [focusId, setFocusId] = useState<string | null>(null)
  const cardRefs = useRef(new Map<string, HTMLDivElement>())

  // Agrupación: cotizador / plantillas generales / por cliente (con buscador)
  const grupos = useMemo(() => {
    const delCotizador = recetas.filter((r) => r.esCotizador)
    const plantillas = recetas.filter((r) => !r.esCotizador && r.clienteId === null)
    const porCliente = new Map<string, { nombre: string; recetas: Receta[] }>()
    for (const r of recetas) {
      if (!r.clienteId) continue
      const nombre = r.cliente ? `${r.cliente.nombre} ${r.cliente.apellido}` : 'Cliente'
      const g = porCliente.get(r.clienteId) ?? { nombre, recetas: [] }
      g.recetas.push(r)
      porCliente.set(r.clienteId, g)
    }
    const q = busqueda.trim().toLowerCase()
    const deClientes = [...porCliente.entries()]
      .filter(([, g]) => !q || g.nombre.toLowerCase().includes(q))
      .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre))
    return { delCotizador, plantillas, deClientes }
  }, [recetas, busqueda])

  // "Navegar a editarla": tras crear o duplicar, scrollea y resalta la card
  useEffect(() => {
    if (!focusId) return
    const el = cardRefs.current.get(focusId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setFocusId(null), 2500)
    return () => clearTimeout(t)
  }, [focusId, recetas])

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['cotizador-recetas'] })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    const gramaje = Number(nuevo.gramaje)
    if (!nuevo.nombre.trim()) { setCreateError('El nombre es requerido'); return }
    if (!Number.isInteger(gramaje) || gramaje <= 0) {
      setCreateError('El gramaje debe ser un entero mayor a 0')
      return
    }
    setIsCreating(true)
    try {
      const res = await fetch('/api/admin/cotizador/recetas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevo.nombre.trim(), gramaje, esCotizador: nuevo.esCotizador, items: [] }),
      })
      const json = await res.json() as { data?: { id: string }; error?: string }
      if (!res.ok || !json.data) {
        setCreateError(json.error ?? 'Error al crear')
        return
      }
      invalidate()
      setShowCreate(false)
      toast.success(`Receta "${nuevo.nombre.trim()}" creada`)
      setNuevo({ nombre: '', gramaje: '', esCotizador: true })
      setFocusId(json.data.id)
    } catch {
      setCreateError('Error de conexión')
    } finally {
      setIsCreating(false)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setDeleteError(null)
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/admin/cotizador/recetas/${deleting.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setDeleteError(data.error ?? 'Error al eliminar')
        return
      }
      invalidate()
      setDeleting(null)
      toast.success('Receta dada de baja')
    } catch {
      setDeleteError('Error de conexión')
    } finally {
      setIsDeleting(false)
    }
  }

  function renderCards(lista: Receta[]) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {lista.map((receta) => (
          <div
            key={`${receta.id}:${receta.updatedAt}`}
            ref={(el) => { if (el) cardRefs.current.set(receta.id, el); else cardRefs.current.delete(receta.id) }}
            className={cn(focusId === receta.id && 'ring-2 ring-primary rounded-lg')}
          >
            <RecetaCard
              receta={receta}
              insumos={insumos}
              config={config}
              onChanged={invalidate}
              onBaja={() => { setDeleteError(null); setDeleting(receta) }}
              onDuplicar={() => setDuplicando(receta)}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <section className="bg-card border border-border rounded-lg p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Recetas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Del cotizador, plantillas generales y recetas por cliente, con su costo por unidad.
          </p>
        </div>
        <button
          onClick={() => { setCreateError(null); setShowCreate(true) }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          Nueva receta
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4">Cargando...</p>
      ) : recetas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No hay recetas cargadas</p>
      ) : (
        <div className="space-y-5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Del cotizador</h3>
            {grupos.delCotizador.length === 0
              ? <p className="text-xs text-muted-foreground">Sin recetas del cotizador</p>
              : renderCards(grupos.delCotizador)}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Plantillas</h3>
            {grupos.plantillas.length === 0
              ? <p className="text-xs text-muted-foreground">Sin plantillas generales</p>
              : renderCards(grupos.plantillas)}
          </div>
          <div>
            <div className="flex items-center justify-between mb-2 gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">De clientes</h3>
              <div className="relative w-56">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar cliente..."
                  className={cn(inputClass, 'pl-8')}
                />
              </div>
            </div>
            {grupos.deClientes.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {busqueda ? 'Ningún cliente coincide con la búsqueda' : 'Sin recetas de clientes'}
              </p>
            ) : grupos.deClientes.map(([clienteId, g]) => (
              <div key={clienteId} className="mb-3">
                <p className="text-xs font-medium text-foreground mb-1.5">{g.nombre}</p>
                {renderCards(g.recetas)}
              </div>
            ))}
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <button className="absolute inset-0" onClick={() => setShowCreate(false)} aria-label="Cerrar" />
          <div className="relative bg-card border border-border rounded-lg p-5 w-full max-w-sm shadow-xl">
            <h2 className="text-sm font-semibold text-foreground mb-4">Nueva receta</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Nombre *</label>
                <input
                  autoFocus required value={nuevo.nombre}
                  onChange={(e) => setNuevo((p) => ({ ...p, nombre: e.target.value }))}
                  placeholder="Ej: Alfajor 65g" className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Gramaje (g) *</label>
                <input
                  required type="number" inputMode="numeric" min="1" step="1"
                  value={nuevo.gramaje}
                  onChange={(e) => setNuevo((p) => ({ ...p, gramaje: e.target.value }))}
                  placeholder="Ej: 65" className={inputClass}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox" checked={nuevo.esCotizador}
                  onChange={(e) => setNuevo((p) => ({ ...p, esCotizador: e.target.checked }))}
                />
                Receta del cotizador (gramaje único entre activas)
              </label>
              {createError && <p className="text-xs text-destructive">{createError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit" disabled={isCreating}
                  className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isCreating ? 'Creando...' : 'Crear receta'}
                </button>
                <button
                  type="button" onClick={() => setShowCreate(false)}
                  className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {duplicando && (
        <DuplicarRecetaModal
          receta={duplicando}
          onClose={() => setDuplicando(null)}
          onDone={(nuevaId) => {
            invalidate()
            setDuplicando(null)
            setBusqueda('')
            setFocusId(nuevaId)
          }}
        />
      )}

      {deleting && (
        <ConfirmDeleteModal
          title="Dar de baja receta"
          description={`¿Dar de baja "${deleting.nombre}" (${deleting.gramaje} g)? No se va a ofrecer más al cotizar.`}
          warning={deleteError ?? undefined}
          onConfirm={handleDelete}
          onClose={() => setDeleting(null)}
          isPending={isDeleting}
        />
      )}
    </section>
  )
}
