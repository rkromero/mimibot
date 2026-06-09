'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Copy, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import MetaFormRow, { type MetaRow, type User, type MetaFormValues } from './MetaFormRow'
import MetaMobileCard from './MetaMobileCard'

// ─── Period helpers ───────────────────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function getDefaultPeriod(): { anio: number; mes: number } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  return month === 12 ? { anio: year + 1, mes: 1 } : { anio: year, mes: month + 1 }
}

function isFuturePeriod(anio: number, mes: number): boolean {
  const now = new Date()
  return anio > now.getFullYear() || (anio === now.getFullYear() && mes > now.getMonth() + 1)
}

function isPastPeriod(anio: number, mes: number): boolean {
  const now = new Date()
  return anio < now.getFullYear() || (anio === now.getFullYear() && mes < now.getMonth() + 1)
}

function isCurrentPeriod(anio: number, mes: number): boolean {
  const now = new Date()
  return anio === now.getFullYear() && mes === now.getMonth() + 1
}

function prevPeriod(anio: number, mes: number) {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 }
}

function nextPeriod(anio: number, mes: number) {
  return mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 }
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDuplicarDialog({
  sourceLabel, targetLabel, onConfirm, onClose, isDuplicating,
}: {
  sourceLabel: string; targetLabel: string
  onConfirm: () => void; onClose: () => void; isDuplicating: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-lg shadow-xl max-w-sm w-full mx-4 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Duplicar metas</h3>
        <p className="text-sm text-muted-foreground">
          ¿Duplicar metas de{' '}
          <span className="font-medium text-foreground">{sourceLabel}</span>{' '}
          como base para{' '}
          <span className="font-medium text-foreground">{targetLabel}</span>?
        </p>
        <p className="text-xs text-muted-foreground">
          Los usuarios que ya tengan meta para {targetLabel} no serán modificados.
          Cada rol conserva sus propios campos.
        </p>
        <div className="flex items-center gap-2 justify-end pt-1">
          <button
            onClick={onClose}
            disabled={isDuplicating}
            className="px-3 py-1.5 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isDuplicating}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isDuplicating ? 'Duplicando...' : 'Duplicar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Table header cell ────────────────────────────────────────────────────────

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn(
      'text-left py-2 px-3 text-xs font-semibold text-muted-foreground border-b border-border whitespace-nowrap',
      className,
    )}>
      {children}
    </th>
  )
}

// ─── Corregir dialog (mes vigente) ───────────────────────────────────────────

function CorregirMetaDialog({
  onConfirm, onClose, isSaving,
}: {
  onConfirm: (motivo: string) => void
  onClose: () => void
  isSaving: boolean
}) {
  const [motivo, setMotivo] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const valid = motivo.trim().length >= 10

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-lg shadow-xl max-w-sm w-full mx-4 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Corregir meta vigente</h3>
        <p className="text-sm text-muted-foreground">
          Estás modificando el mes en curso. Indicá el motivo de la corrección.
        </p>
        <div>
          <textarea
            ref={inputRef}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: Ajuste por ingreso de nuevo vendedor..."
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <p className="text-xs text-muted-foreground mt-1">{motivo.trim().length}/10 caracteres mínimos</p>
        </div>
        <div className="flex items-center gap-2 justify-end pt-1">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-3 py-1.5 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => valid && onConfirm(motivo.trim())}
            disabled={!valid || isSaving}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Guardando...' : 'Confirmar corrección'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MetasAdminView() {
  const defaults = getDefaultPeriod()
  const [selectedAnio, setSelectedAnio] = useState(defaults.anio)
  const [selectedMes, setSelectedMes] = useState(defaults.mes)

  const [users, setUsers] = useState<User[]>([])
  const [metasMap, setMetasMap] = useState<Map<string, MetaRow>>(new Map())
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingMetas, setLoadingMetas] = useState(false)
  const [savingMap, setSavingMap] = useState<Map<string, boolean>>(new Map())
  const [showConfirmDuplicar, setShowConfirmDuplicar] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingCorreccion, setPendingCorreccion] = useState<{ userId: string; values: MetaFormValues } | null>(null)

  // Fetch both agents and vendedores once
  useEffect(() => {
    async function fetchUsers() {
      setLoadingUsers(true)
      try {
        const res = await fetch('/api/users?role=agent,vendedor')
        if (!res.ok) throw new Error('Error al cargar usuarios')
        const json = await res.json() as { data: User[] }
        setUsers(json.data.filter((u) => u.isActive !== false))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar usuarios')
      } finally {
        setLoadingUsers(false)
      }
    }
    void fetchUsers()
  }, [])

  const fetchMetas = useCallback(async (anio: number, mes: number) => {
    setLoadingMetas(true)
    setError(null)
    try {
      const res = await fetch(`/api/metas?anio=${anio}&mes=${mes}`)
      if (!res.ok) throw new Error('Error al cargar metas')
      const json = await res.json() as { data: MetaRow[] }
      const map = new Map<string, MetaRow>()
      for (const row of json.data) map.set(row.vendedorId, row)
      setMetasMap(map)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar metas')
    } finally {
      setLoadingMetas(false)
    }
  }, [])

  useEffect(() => { void fetchMetas(selectedAnio, selectedMes) }, [selectedAnio, selectedMes, fetchMetas])

  function handlePrevMes() {
    const p = prevPeriod(selectedAnio, selectedMes)
    setSelectedAnio(p.anio); setSelectedMes(p.mes)
  }
  function handleNextMes() {
    const p = nextPeriod(selectedAnio, selectedMes)
    setSelectedAnio(p.anio); setSelectedMes(p.mes)
  }

  async function handleSaveMeta(userId: string, values: MetaFormValues) {
    // Mes vigente: requiere motivo via /corregir
    if (isCurrentPeriod(selectedAnio, selectedMes) && metasMap.has(userId)) {
      setPendingCorreccion({ userId, values })
      return
    }
    await doSaveMeta(userId, values, null)
  }

  async function doSaveMeta(userId: string, values: MetaFormValues, motivo: string | null) {
    setSavingMap((prev) => new Map(prev).set(userId, true))
    setError(null)
    try {
      const existingMeta = metasMap.get(userId)
      let res: Response
      if (existingMeta && motivo !== null) {
        // Corrección de meta vigente
        res = await fetch(`/api/metas/${existingMeta.id}/corregir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...values, motivo }),
        })
      } else if (existingMeta) {
        res = await fetch(`/api/metas/${existingMeta.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        })
      } else {
        res = await fetch('/api/metas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendedorId: userId, periodoAnio: selectedAnio, periodoMes: selectedMes, ...values }),
        })
      }
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Error al guardar meta')
      }
      await fetchMetas(selectedAnio, selectedMes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSavingMap((prev) => { const n = new Map(prev); n.delete(userId); return n })
    }
  }

  async function handleDuplicar() {
    setIsDuplicating(true); setError(null)
    try {
      const res = await fetch('/api/metas/duplicar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anioObjetivo: selectedAnio, mesObjetivo: selectedMes }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Error al duplicar')
      }
      await fetchMetas(selectedAnio, selectedMes)
      setShowConfirmDuplicar(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al duplicar')
    } finally {
      setIsDuplicating(false)
    }
  }

  // Alert: day 1-3 of current month with missing metas
  const today = new Date()
  const dayOfMonth = today.getDate()
  const isViewingCurrentMonth = selectedAnio === today.getFullYear() && selectedMes === today.getMonth() + 1
  const sinMeta = users.filter((u) => !metasMap.has(u.id)).length
  const showAlert = dayOfMonth <= 3 && isViewingCurrentMonth && sinMeta > 0 && !loadingMetas

  const isLocked = isPastPeriod(selectedAnio, selectedMes)
  const isFuture = isFuturePeriod(selectedAnio, selectedMes)

  const prev = prevPeriod(selectedAnio, selectedMes)
  const sourceLabel = `${MESES[prev.mes - 1]} ${prev.anio}`
  const targetLabel = `${MESES[selectedMes - 1]} ${selectedAnio}`

  const agentes = users.filter((u) => u.role === 'agent')
  const vendedores = users.filter((u) => u.role === 'vendedor')

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button onClick={handlePrevMes}
            className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Mes anterior"><ChevronLeft size={16} /></button>
          <span className="px-3 py-1.5 text-sm font-semibold text-foreground min-w-[130px] text-center">
            {MESES[selectedMes - 1]} {selectedAnio}
          </span>
          <button onClick={handleNextMes}
            className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Siguiente mes"><ChevronRight size={16} /></button>
        </div>
        {isFuture && (
          <button onClick={() => setShowConfirmDuplicar(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors">
            <Copy size={14} />
            Duplicar mes anterior
          </button>
        )}
      </div>

      {/* ── Banners ── */}
      {showAlert && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Hay <span className="font-semibold">{sinMeta}</span>{' '}
            {sinMeta === 1 ? 'usuario sin meta' : 'usuarios sin meta'} para el mes en curso.
          </p>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
      {isLocked && (
        <div className="p-3 rounded-lg bg-muted border border-border">
          <p className="text-sm text-muted-foreground">Este período ya pasó. Las metas son de solo lectura.</p>
        </div>
      )}

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-blue-200 dark:bg-blue-800 inline-block" />
          Métricas de agente
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-purple-200 dark:bg-purple-800 inline-block" />
          Métricas de vendedor
        </span>
      </div>

      {/* ── Desktop table (hidden on mobile) ── */}
      <div className="hidden md:block bg-card border border-border rounded-lg overflow-hidden">
        {loadingUsers || loadingMetas ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {loadingUsers ? 'Cargando usuarios...' : 'Cargando metas...'}
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No hay agentes ni vendedores activos.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {/* Group header row */}
                <tr>
                  <th rowSpan={2} className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground border-b border-border whitespace-nowrap align-bottom">
                    Usuario
                  </th>
                  <th colSpan={5} className="py-1.5 px-3 text-center text-xs font-bold text-blue-700 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800 whitespace-nowrap">
                    Métricas de Agente
                  </th>
                  <th colSpan={4} className="py-1.5 px-3 text-center text-xs font-bold text-purple-700 dark:text-purple-400 bg-purple-50/60 dark:bg-purple-950/30 border-b border-purple-200 dark:border-purple-800 border-l border-l-purple-200 dark:border-l-purple-800 whitespace-nowrap">
                    Métricas de Vendedor
                  </th>
                  <th rowSpan={2} className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground border-b border-border whitespace-nowrap align-bottom">
                    Estado
                  </th>
                </tr>
                {/* Column header row */}
                <tr>
                  <Th className="bg-blue-50/40 dark:bg-blue-950/20">Cl. Nuevos</Th>
                  <Th className="bg-blue-50/40 dark:bg-blue-950/20">Conv. Leads (%)</Th>
                  <Th className="bg-blue-50/40 dark:bg-blue-950/20">% Cobertura</Th>
                  <Th className="bg-blue-50/40 dark:bg-blue-950/20">% Pedidos Pagados</Th>
                  <Th className="bg-blue-50/40 dark:bg-blue-950/20">% Cobranza</Th>
                  <Th className="bg-purple-50/40 dark:bg-purple-950/20 border-l border-l-purple-200 dark:border-l-purple-800">Cl. Nuevos</Th>
                  <Th className="bg-purple-50/40 dark:bg-purple-950/20">Cl. c/PP</Th>
                  <Th className="bg-purple-50/40 dark:bg-purple-950/20">% Cobertura</Th>
                  <Th className="bg-purple-50/40 dark:bg-purple-950/20">% Cobranza</Th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <MetaFormRow
                    key={user.id}
                    vendedor={user}
                    meta={metasMap.get(user.id) ?? null}
                    periodoAnio={selectedAnio}
                    periodoMes={selectedMes}
                    onSave={(values) => handleSaveMeta(user.id, values)}
                    isSaving={savingMap.get(user.id) === true}
                    isLocked={isLocked}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Mobile cards (hidden on desktop) ── */}
      <div className="md:hidden space-y-3">
        {loadingUsers || loadingMetas ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {loadingUsers ? 'Cargando usuarios...' : 'Cargando metas...'}
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No hay agentes ni vendedores activos.</div>
        ) : (
          users.map((user) => (
            <MetaMobileCard
              key={user.id}
              vendedor={user}
              meta={metasMap.get(user.id) ?? null}
              onSave={(values) => handleSaveMeta(user.id, values)}
              isSaving={savingMap.get(user.id) === true}
              isLocked={isLocked}
            />
          ))
        )}
      </div>

      {/* ── Summary ── */}
      {!loadingUsers && !loadingMetas && users.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex gap-4">
            <span>{agentes.filter((a) => metasMap.has(a.id)).length}/{agentes.length} agentes con meta</span>
            <span>{vendedores.filter((v) => metasMap.has(v.id)).length}/{vendedores.length} vendedores con meta</span>
          </div>
          <span className="text-right">{metasMap.size} de {users.length} con meta para {targetLabel}</span>
        </div>
      )}

      {/* ── Confirm duplicar dialog ── */}
      {showConfirmDuplicar && (
        <ConfirmDuplicarDialog
          sourceLabel={sourceLabel}
          targetLabel={targetLabel}
          onConfirm={() => void handleDuplicar()}
          onClose={() => setShowConfirmDuplicar(false)}
          isDuplicating={isDuplicating}
        />
      )}

      {pendingCorreccion && (
        <CorregirMetaDialog
          isSaving={savingMap.get(pendingCorreccion.userId) === true}
          onClose={() => setPendingCorreccion(null)}
          onConfirm={(motivo) => {
            const { userId, values } = pendingCorreccion
            setPendingCorreccion(null)
            void doSaveMeta(userId, values, motivo)
          }}
        />
      )}
    </div>
  )
}
