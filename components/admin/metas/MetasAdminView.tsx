'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Copy, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import MetaFormRow, { type MetaRow, type User, type MetaFormValues } from './MetaFormRow'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function getDefaultPeriod(): { anio: number; mes: number } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // 1-based
  if (month === 12) {
    return { anio: year + 1, mes: 1 }
  }
  return { anio: year, mes: month + 1 }
}

function isFuturePeriod(anio: number, mes: number): boolean {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  return anio > currentYear || (anio === currentYear && mes > currentMonth)
}

function isPastPeriod(anio: number, mes: number): boolean {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  return anio < currentYear || (anio === currentYear && mes < currentMonth)
}

function prevPeriod(anio: number, mes: number): { anio: number; mes: number } {
  if (mes === 1) return { anio: anio - 1, mes: 12 }
  return { anio, mes: mes - 1 }
}

function nextPeriod(anio: number, mes: number): { anio: number; mes: number } {
  if (mes === 12) return { anio: anio + 1, mes: 1 }
  return { anio, mes: mes + 1 }
}

type ConfirmDialogProps = {
  sourceLabel: string
  targetLabel: string
  onConfirm: () => void
  onClose: () => void
  isDuplicating: boolean
}

function ConfirmDuplicarDialog({ sourceLabel, targetLabel, onConfirm, onClose, isDuplicating }: ConfirmDialogProps) {
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
          Los vendedores que ya tengan meta para {targetLabel} no serán modificados.
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

export default function MetasAdminView() {
  const defaults = getDefaultPeriod()
  const [selectedAnio, setSelectedAnio] = useState(defaults.anio)
  const [selectedMes, setSelectedMes] = useState(defaults.mes)

  const [agents, setAgents] = useState<User[]>([])
  const [metasMap, setMetasMap] = useState<Map<string, MetaRow>>(new Map())
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [loadingMetas, setLoadingMetas] = useState(false)
  const [savingMap, setSavingMap] = useState<Map<string, boolean>>(new Map())
  const [showConfirmDuplicar, setShowConfirmDuplicar] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch agents once on mount
  useEffect(() => {
    async function fetchAgents() {
      setLoadingAgents(true)
      try {
        const res = await fetch('/api/users?role=agent')
        if (!res.ok) throw new Error('Error al cargar vendedores')
        const json = await res.json() as { data: User[] }
        setAgents(json.data.filter((u) => u.isActive !== false))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar vendedores')
      } finally {
        setLoadingAgents(false)
      }
    }
    void fetchAgents()
  }, [])

  // Fetch metas when period changes
  const fetchMetas = useCallback(async (anio: number, mes: number) => {
    setLoadingMetas(true)
    setError(null)
    try {
      const res = await fetch(`/api/metas?anio=${anio}&mes=${mes}`)
      if (!res.ok) throw new Error('Error al cargar metas')
      const json = await res.json() as { data: MetaRow[] }
      const map = new Map<string, MetaRow>()
      for (const row of json.data) {
        map.set(row.vendedorId, row)
      }
      setMetasMap(map)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar metas')
    } finally {
      setLoadingMetas(false)
    }
  }, [])

  useEffect(() => {
    void fetchMetas(selectedAnio, selectedMes)
  }, [selectedAnio, selectedMes, fetchMetas])

  function handlePrevMes() {
    const p = prevPeriod(selectedAnio, selectedMes)
    setSelectedAnio(p.anio)
    setSelectedMes(p.mes)
  }

  function handleNextMes() {
    const p = nextPeriod(selectedAnio, selectedMes)
    setSelectedAnio(p.anio)
    setSelectedMes(p.mes)
  }

  async function handleSaveMeta(vendedorId: string, values: MetaFormValues) {
    setSavingMap((prev) => new Map(prev).set(vendedorId, true))
    setError(null)
    try {
      const res = await fetch('/api/metas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendedorId,
          periodoAnio: selectedAnio,
          periodoMes: selectedMes,
          ...values,
        }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Error al guardar meta')
      }
      await fetchMetas(selectedAnio, selectedMes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSavingMap((prev) => {
        const next = new Map(prev)
        next.delete(vendedorId)
        return next
      })
    }
  }

  async function handleDuplicar() {
    setIsDuplicating(true)
    setError(null)
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

  // Alert: today is day 1-3 AND current month has missing metas
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1
  const dayOfMonth = today.getDate()
  const isViewingCurrentMonth = selectedAnio === currentYear && selectedMes === currentMonth
  const vendedoresSinMeta = agents.filter((a) => !metasMap.has(a.id)).length
  const showAlert =
    dayOfMonth <= 3 && isViewingCurrentMonth && vendedoresSinMeta > 0 && !loadingMetas

  const isLocked = isPastPeriod(selectedAnio, selectedMes)
  const isFuture = isFuturePeriod(selectedAnio, selectedMes)

  const prevLabel = MESES[(prevPeriod(selectedAnio, selectedMes).mes - 1)]
  const targetLabel = `${MESES[selectedMes - 1]} ${selectedAnio}`
  const sourceLabel = `${prevLabel} ${prevPeriod(selectedAnio, selectedMes).anio}`

  return (
    <div className="space-y-4">
      {/* Header toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Period navigator */}
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrevMes}
            className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Mes anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="px-3 py-1.5 text-sm font-semibold text-foreground min-w-[130px] text-center">
            {MESES[selectedMes - 1]} {selectedAnio}
          </span>
          <button
            onClick={handleNextMes}
            className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Siguiente mes"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Duplicar button — only for future periods */}
        {isFuture && (
          <button
            onClick={() => setShowConfirmDuplicar(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Copy size={14} />
            Duplicar mes anterior
          </button>
        )}
      </div>

      {/* Alert banner */}
      {showAlert && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Hay{' '}
            <span className="font-semibold">{vendedoresSinMeta}</span>{' '}
            {vendedoresSinMeta === 1 ? 'vendedor sin meta' : 'vendedores sin meta'} para el mes en curso.
          </p>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Period lock notice */}
      {isLocked && (
        <div className="p-3 rounded-lg bg-muted border border-border">
          <p className="text-sm text-muted-foreground">
            Este período ya pasó. Las metas son de solo lectura.
          </p>
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loadingAgents || loadingMetas ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {loadingAgents ? 'Cargando vendedores...' : 'Cargando metas...'}
          </div>
        ) : agents.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No hay vendedores activos.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border whitespace-nowrap">
                    Vendedor
                  </th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border whitespace-nowrap">
                    Clientes Nuevos
                  </th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border whitespace-nowrap">
                    Pedidos
                  </th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border whitespace-nowrap">
                    Monto Cobrado ($)
                  </th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border whitespace-nowrap">
                    Conversión Leads (%)
                  </th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border whitespace-nowrap">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <MetaFormRow
                    key={agent.id}
                    vendedor={agent}
                    meta={metasMap.get(agent.id) ?? null}
                    periodoAnio={selectedAnio}
                    periodoMes={selectedMes}
                    onSave={(values) => handleSaveMeta(agent.id, values)}
                    isSaving={savingMap.get(agent.id) === true}
                    isLocked={isLocked}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary row */}
      {!loadingAgents && !loadingMetas && agents.length > 0 && (
        <p className={cn('text-xs text-muted-foreground text-right')}>
          {metasMap.size} de {agents.length} vendedores con meta cargada para {targetLabel}
        </p>
      )}

      {/* Confirm duplicar dialog */}
      {showConfirmDuplicar && (
        <ConfirmDuplicarDialog
          sourceLabel={sourceLabel}
          targetLabel={targetLabel}
          onConfirm={() => void handleDuplicar()}
          onClose={() => setShowConfirmDuplicar(false)}
          isDuplicating={isDuplicating}
        />
      )}
    </div>
  )
}
