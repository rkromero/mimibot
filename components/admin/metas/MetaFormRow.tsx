'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

export type MetaRow = {
  id: string
  vendedorId: string
  vendedorNombre?: string
  periodoAnio: number
  periodoMes: number
  clientesNuevosObjetivo: number
  pedidosObjetivo: number
  montoCobradoObjetivo: string
  conversionLeadsObjetivo: string
  fechaCreacion: string
  fechaActualizacion: string
}

export type User = {
  id: string
  name: string
  email: string
  role: string
  avatarColor: string | null
  isActive?: boolean
}

export type MetaFormValues = {
  clientesNuevosObjetivo: number
  pedidosObjetivo: number
  montoCobradoObjetivo: string
  conversionLeadsObjetivo: string
}

type Props = {
  vendedor: User
  meta: MetaRow | null
  periodoAnio: number
  periodoMes: number
  onSave: (values: MetaFormValues) => Promise<void>
  isSaving: boolean
  isLocked: boolean
}

function initValues(meta: MetaRow | null): MetaFormValues {
  if (!meta) {
    return {
      clientesNuevosObjetivo: 0,
      pedidosObjetivo: 0,
      montoCobradoObjetivo: '0',
      conversionLeadsObjetivo: '0',
    }
  }
  return {
    clientesNuevosObjetivo: meta.clientesNuevosObjetivo,
    pedidosObjetivo: meta.pedidosObjetivo,
    montoCobradoObjetivo: meta.montoCobradoObjetivo,
    conversionLeadsObjetivo: meta.conversionLeadsObjetivo,
  }
}

function valuesEqual(a: MetaFormValues, b: MetaFormValues): boolean {
  return (
    a.clientesNuevosObjetivo === b.clientesNuevosObjetivo &&
    a.pedidosObjetivo === b.pedidosObjetivo &&
    a.montoCobradoObjetivo === b.montoCobradoObjetivo &&
    a.conversionLeadsObjetivo === b.conversionLeadsObjetivo
  )
}

export default function MetaFormRow({
  vendedor,
  meta,
  onSave,
  isSaving,
  isLocked,
}: Props) {
  const [values, setValues] = useState<MetaFormValues>(() => initValues(meta))
  const [savedValues, setSavedValues] = useState<MetaFormValues>(() => initValues(meta))

  // Sync when meta prop changes (e.g. after period change or save)
  useEffect(() => {
    const fresh = initValues(meta)
    setValues(fresh)
    setSavedValues(fresh)
  }, [meta])

  const isDirty = !valuesEqual(values, savedValues)

  function handleChange(field: keyof MetaFormValues, raw: string) {
    if (field === 'clientesNuevosObjetivo' || field === 'pedidosObjetivo') {
      const n = parseInt(raw, 10)
      setValues((prev) => ({ ...prev, [field]: isNaN(n) ? 0 : n }))
    } else {
      setValues((prev) => ({ ...prev, [field]: raw }))
    }
  }

  async function handleSave() {
    await onSave(values)
    setSavedValues(values)
  }

  const avatarColor = vendedor.avatarColor ?? '#6b7280'
  const initial = (vendedor.name[0] ?? '?').toUpperCase()

  const inputClass = 'w-full border border-border rounded px-2 py-1 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring'
  const readonlyClass = 'text-sm text-muted-foreground'

  const hasMeta = meta !== null

  return (
    <tr className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
      {/* Vendedor */}
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-7 h-7 rounded-full inline-flex items-center justify-center text-white text-xs font-semibold shrink-0"
            style={{ backgroundColor: avatarColor }}
          >
            {initial}
          </span>
          <span className="text-sm font-medium text-foreground truncate">{vendedor.name}</span>
        </div>
      </td>

      {/* Clientes Nuevos */}
      <td className="py-2.5 px-3">
        {isLocked ? (
          <span className={readonlyClass}>{meta?.clientesNuevosObjetivo ?? '—'}</span>
        ) : (
          <input
            type="number"
            min={0}
            value={values.clientesNuevosObjetivo}
            onChange={(e) => handleChange('clientesNuevosObjetivo', e.target.value)}
            className={inputClass}
          />
        )}
      </td>

      {/* Pedidos */}
      <td className="py-2.5 px-3">
        {isLocked ? (
          <span className={readonlyClass}>{meta?.pedidosObjetivo ?? '—'}</span>
        ) : (
          <input
            type="number"
            min={0}
            value={values.pedidosObjetivo}
            onChange={(e) => handleChange('pedidosObjetivo', e.target.value)}
            className={inputClass}
          />
        )}
      </td>

      {/* Monto Cobrado */}
      <td className="py-2.5 px-3">
        {isLocked ? (
          <span className={readonlyClass}>
            {meta
              ? `$${parseFloat(meta.montoCobradoObjetivo).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
              : '—'}
          </span>
        ) : (
          <input
            type="number"
            min={0}
            step="100"
            value={values.montoCobradoObjetivo}
            onChange={(e) => handleChange('montoCobradoObjetivo', e.target.value)}
            className={inputClass}
          />
        )}
      </td>

      {/* Conversión Leads */}
      <td className="py-2.5 px-3">
        {isLocked ? (
          <span className={readonlyClass}>
            {meta ? `${parseFloat(meta.conversionLeadsObjetivo).toFixed(1)}%` : '—'}
          </span>
        ) : (
          <input
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={values.conversionLeadsObjetivo}
            onChange={(e) => handleChange('conversionLeadsObjetivo', e.target.value)}
            className={inputClass}
          />
        )}
      </td>

      {/* Estado + Guardar */}
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2 justify-between">
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
              hasMeta
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
            )}
          >
            {hasMeta ? 'Cargada' : 'Pendiente'}
          </span>

          {!isLocked && isDirty && (
            <button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="px-2.5 py-1 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
