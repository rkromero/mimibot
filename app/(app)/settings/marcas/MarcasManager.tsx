'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'

type Marca = { id: string; nombre: string; slug: string; activo: boolean; esDefault: boolean }
type VentasUser = { id: string; name: string | null; email: string; role: string }

type Props = {
  initialMarcas: Marca[]
  ventasUsers: VentasUser[]
  initialAsignaciones: Record<string, string[]>
}

const inputClass = cn(
  'w-full px-3 py-1.5 text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'transition-colors duration-100',
)

const ROLE_LABEL: Record<string, string> = { agent: 'Agente', vendedor: 'Vendedor', rtv: 'RTV' }

export default function MarcasManager({ initialMarcas, ventasUsers, initialAsignaciones }: Props) {
  const [marcas, setMarcas] = useState(initialMarcas)
  const [asignaciones, setAsignaciones] = useState(initialAsignaciones)

  return (
    <div className="max-w-2xl space-y-8">
      <MarcasSection marcas={marcas} setMarcas={setMarcas} />
      <AsignacionSection
        marcas={marcas}
        ventasUsers={ventasUsers}
        asignaciones={asignaciones}
        setAsignaciones={setAsignaciones}
      />
    </div>
  )
}

// ─── Sección: CRUD de marcas ──────────────────────────────────────────────────

function MarcasSection({ marcas, setMarcas }: { marcas: Marca[]; setMarcas: React.Dispatch<React.SetStateAction<Marca[]>> }) {
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const nombre = nuevoNombre.trim()
    if (!nombre) { setError('El nombre es requerido'); return }

    startTransition(async () => {
      try {
        const res = await fetch('/api/marcas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre }),
        })
        const data = await res.json() as { data?: Marca; error?: string }
        if (!res.ok || !data.data) { setError(data.error ?? 'Error al crear la marca'); return }
        setMarcas((prev) => [...prev, data.data!])
        setNuevoNombre('')
      } catch {
        setError('No se pudo conectar con el servidor.')
      }
    })
  }

  function handleSaveNombre(id: string) {
    const nombre = editNombre.trim()
    if (!nombre) return
    startTransition(async () => {
      try {
        const res = await fetch(`/api/marcas/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre }),
        })
        const data = await res.json() as { data?: Marca; error?: string }
        if (!res.ok || !data.data) { setError(data.error ?? 'Error al guardar'); return }
        setMarcas((prev) => prev.map((m) => m.id === id ? { ...m, nombre: data.data!.nombre } : m))
        setEditId(null)
      } catch {
        setError('No se pudo conectar con el servidor.')
      }
    })
  }

  function handleToggleActivo(marca: Marca) {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/marcas/${marca.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activo: !marca.activo }),
        })
        const data = await res.json() as { data?: Marca; error?: string }
        if (!res.ok || !data.data) { setError(data.error ?? 'Error al actualizar'); return }
        setMarcas((prev) => prev.map((m) => m.id === marca.id ? { ...m, activo: data.data!.activo } : m))
      } catch {
        setError('No se pudo conectar con el servidor.')
      }
    })
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-md font-semibold">Marcas</h2>
        <p className="text-sm text-muted-foreground">Creá y administrá las marcas del catálogo.</p>
      </div>

      <form onSubmit={handleCreate} className="flex gap-2 mb-4">
        <input
          value={nuevoNombre}
          onChange={(e) => setNuevoNombre(e.target.value)}
          placeholder="Nombre de la nueva marca"
          className={inputClass}
        />
        <button
          type="submit"
          disabled={isPending}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          Crear marca
        </button>
      </form>

      {error && <p className="text-xs text-destructive mb-3">{error}</p>}

      <div className="divide-y divide-border rounded-md border border-border">
        {marcas.map((marca) => (
          <div key={marca.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              {editId === marca.id ? (
                <div className="flex gap-2 items-center">
                  <input
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    className={inputClass}
                    autoFocus
                  />
                  <button
                    onClick={() => handleSaveNombre(marca.id)}
                    disabled={isPending}
                    className="text-xs underline hover:text-foreground transition-colors whitespace-nowrap"
                  >
                    Guardar
                  </button>
                  <button
                    onClick={() => setEditId(null)}
                    className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{marca.nombre}</span>
                  {marca.esDefault && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-primary/10 text-primary">Default</span>
                  )}
                  {!marca.activo && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-muted-foreground">Inactiva</span>
                  )}
                </div>
              )}
            </div>

            {editId !== marca.id && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                <button
                  onClick={() => { setEditId(marca.id); setEditNombre(marca.nombre); setError(null) }}
                  className="underline hover:text-foreground transition-colors"
                >
                  Editar
                </button>
                {!marca.esDefault && (
                  <button
                    onClick={() => handleToggleActivo(marca)}
                    disabled={isPending}
                    className="underline hover:text-foreground transition-colors"
                  >
                    {marca.activo ? 'Desactivar' : 'Activar'}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Sección: Asignación de marcas por usuario de ventas ──────────────────────

function AsignacionSection({
  marcas,
  ventasUsers,
  asignaciones,
  setAsignaciones,
}: {
  marcas: Marca[]
  ventasUsers: VentasUser[]
  asignaciones: Record<string, string[]>
  setAsignaciones: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Marcas asignables (excluye la default, que es implícita) y activas.
  const asignables = marcas.filter((m) => m.activo && !m.esDefault)
  const marcaDefault = marcas.find((m) => m.esDefault)

  function openEdit(userId: string) {
    setError(null)
    setSavedId(null)
    setExpandedId(userId)
    setDraft(asignaciones[userId] ?? [])
  }

  function toggle(marcaId: string) {
    setDraft((prev) => prev.includes(marcaId) ? prev.filter((m) => m !== marcaId) : [...prev, marcaId])
  }

  function handleSave(userId: string) {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/users/${userId}/marcas`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ marcaIds: draft }),
        })
        const data = await res.json() as { data?: string[]; error?: string }
        if (!res.ok || !data.data) { setError(data.error ?? 'Error al guardar'); return }
        setAsignaciones((prev) => ({ ...prev, [userId]: data.data! }))
        setExpandedId(null)
        setSavedId(userId)
      } catch {
        setError('No se pudo conectar con el servidor.')
      }
    })
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-md font-semibold">Marcas por vendedor</h2>
        <p className="text-sm text-muted-foreground">
          Elegí qué marcas puede ver y cargar cada usuario de ventas.
          {marcaDefault ? ` La marca ${marcaDefault.nombre} está siempre habilitada.` : ''}
        </p>
      </div>

      {ventasUsers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay usuarios de ventas activos.</p>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {ventasUsers.map((user) => {
            const asignadas = asignaciones[user.id] ?? []
            const isExpanded = expandedId === user.id
            return (
              <div key={user.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{user.name ?? 'Sin nombre'}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-muted-foreground">
                        {ROLE_LABEL[user.role] ?? user.role}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {asignadas.length === 0
                        ? marcaDefault ? `Solo ${marcaDefault.nombre}` : 'Sin marcas extra'
                        : `${asignadas.length} marca${asignadas.length === 1 ? '' : 's'} extra`}
                      {savedId === user.id && <span className="text-emerald-600 ml-2">Guardado ✓</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => isExpanded ? setExpandedId(null) : openEdit(user.id)}
                    className="text-xs underline hover:text-foreground transition-colors text-muted-foreground shrink-0"
                  >
                    {isExpanded ? 'Cerrar' : 'Editar marcas'}
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    {marcaDefault && (
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input type="checkbox" checked disabled className="accent-primary" />
                        {marcaDefault.nombre} <span className="text-xs">(siempre habilitada)</span>
                      </label>
                    )}
                    {asignables.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No hay otras marcas activas para asignar.</p>
                    ) : (
                      asignables.map((m) => (
                        <label key={m.id} className="flex items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={draft.includes(m.id)}
                            onChange={() => toggle(m.id)}
                            className="accent-primary"
                          />
                          {m.nombre}
                        </label>
                      ))
                    )}
                    {error && <p className="text-xs text-destructive">{error}</p>}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleSave(user.id)}
                        disabled={isPending}
                        className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {isPending ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button
                        onClick={() => setExpandedId(null)}
                        className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
