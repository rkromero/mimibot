'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/shared/ToastProvider'
import { inputClass } from './InsumosSection'

type Config = {
  margenPct: string
  cargoSetupPersonalizado: string
  alfajoresPorCaja: number
  validezDias: number
  topeDescuentoPct: string
  condicionesComerciales: string | null
}

type Escalon = {
  cantidadMin: number
  cantidadMax: number | null
  descuentoPct: string
}

type ConfigForm = {
  margenPct: string
  cargoSetupPersonalizado: string
  alfajoresPorCaja: string
  validezDias: string
  topeDescuentoPct: string
  condicionesComerciales: string
}

type EscalonDraft = { cantidadMin: string; cantidadMax: string; descuentoPct: string }

export default function ConfigSection() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data, isLoading } = useQuery<{ config: Config; escalones: Escalon[] }>({
    queryKey: ['cotizador-config'],
    queryFn: async () => {
      const res = await fetch('/api/admin/cotizador/config')
      if (!res.ok) throw new Error('Error al cargar configuración')
      const json = await res.json() as { data: { config: Config; escalones: Escalon[] } }
      return json.data
    },
  })

  const [form, setForm] = useState<ConfigForm | null>(null)
  const [escalones, setEscalones] = useState<EscalonDraft[] | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [escalonesError, setEscalonesError] = useState<string | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)
  const [savingEscalones, setSavingEscalones] = useState(false)

  useEffect(() => {
    if (!data) return
    setForm({
      margenPct: data.config.margenPct,
      cargoSetupPersonalizado: data.config.cargoSetupPersonalizado,
      alfajoresPorCaja: String(data.config.alfajoresPorCaja),
      validezDias: String(data.config.validezDias),
      topeDescuentoPct: data.config.topeDescuentoPct,
      condicionesComerciales: data.config.condicionesComerciales ?? '',
    })
    setEscalones(
      data.escalones.map((e) => ({
        cantidadMin: String(e.cantidadMin),
        cantidadMax: e.cantidadMax === null ? '' : String(e.cantidadMax),
        descuentoPct: e.descuentoPct,
      })),
    )
  }, [data])

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setConfigError(null)
    setSavingConfig(true)
    try {
      const res = await fetch('/api/admin/cotizador/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          margenPct: Number(form.margenPct),
          cargoSetupPersonalizado: Number(form.cargoSetupPersonalizado),
          alfajoresPorCaja: Number(form.alfajoresPorCaja),
          validezDias: Number(form.validezDias),
          topeDescuentoPct: Number(form.topeDescuentoPct),
          condicionesComerciales: form.condicionesComerciales.trim() || null,
        }),
      })
      if (!res.ok) {
        const json = await res.json() as { error: string }
        setConfigError(json.error ?? 'Error al guardar')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['cotizador-config'] })
      toast.success('Configuración guardada')
    } catch {
      setConfigError('Error de conexión')
    } finally {
      setSavingConfig(false)
    }
  }

  async function handleSaveEscalones() {
    if (!escalones) return
    setEscalonesError(null)
    setSavingEscalones(true)
    try {
      const res = await fetch('/api/admin/cotizador/escalones', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escalones: escalones.map((e) => ({
            cantidadMin: Number(e.cantidadMin),
            cantidadMax: e.cantidadMax.trim() === '' ? null : Number(e.cantidadMax),
            descuentoPct: Number(e.descuentoPct),
          })),
        }),
      })
      if (!res.ok) {
        const json = await res.json() as { error: string }
        setEscalonesError(json.error ?? 'Error al guardar')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['cotizador-config'] })
      toast.success('Escalones guardados')
    } catch {
      setEscalonesError('Error de conexión')
    } finally {
      setSavingEscalones(false)
    }
  }

  if (isLoading || !form || !escalones) {
    return (
      <section className="bg-card border border-border rounded-lg p-4 md:p-5">
        <h2 className="text-sm font-semibold text-foreground mb-2">Parámetros y escalones</h2>
        <p className="text-sm text-muted-foreground py-4">Cargando...</p>
      </section>
    )
  }

  return (
    <section className="bg-card border border-border rounded-lg p-4 md:p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Parámetros del cotizador</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Los porcentajes se expresan como número (35 = 35%).
        </p>
      </div>

      <form onSubmit={handleSaveConfig} className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Margen (%)</label>
            <input
              type="number" inputMode="decimal" min="0" step="0.01" required
              value={form.margenPct}
              onChange={(e) => setForm((f) => f && { ...f, margenPct: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Setup personalizado ($)</label>
            <input
              type="number" inputMode="decimal" min="0" step="0.01" required
              value={form.cargoSetupPersonalizado}
              onChange={(e) => setForm((f) => f && { ...f, cargoSetupPersonalizado: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Alfajores por caja</label>
            <input
              type="number" inputMode="numeric" min="1" step="1" required
              value={form.alfajoresPorCaja}
              onChange={(e) => setForm((f) => f && { ...f, alfajoresPorCaja: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Validez (días)</label>
            <input
              type="number" inputMode="numeric" min="1" step="1" required
              value={form.validezDias}
              onChange={(e) => setForm((f) => f && { ...f, validezDias: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Tope desc. manual (%)</label>
            <input
              type="number" inputMode="decimal" min="0" max="100" step="0.01" required
              value={form.topeDescuentoPct}
              onChange={(e) => setForm((f) => f && { ...f, topeDescuentoPct: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-muted-foreground">Condiciones comerciales</label>
            <span className={cn(
              'text-[11px] tabular-nums',
              form.condicionesComerciales.length > 2500
                ? 'text-amber-600 dark:text-amber-400 font-medium'
                : 'text-muted-foreground',
            )}>
              {form.condicionesComerciales.length.toLocaleString('es-AR')} / 2.500
            </span>
          </div>
          <textarea
            rows={15}
            value={form.condicionesComerciales}
            onChange={(e) => setForm((f) => f && { ...f, condicionesComerciales: e.target.value })}
            placeholder={'Cláusulas separadas por una línea en blanco. El título de cada una (hasta el primer punto) sale en negrita en el PDF.\n\nEj:\n1. FORMA DE PAGO. Seña del 50% al confirmar...'}
            className={cn(inputClass, 'resize-y font-mono text-xs leading-relaxed')}
          />
          {form.condicionesComerciales.length > 2500 && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Superaste los 2.500 caracteres: el bloque de condiciones puede no entrar en la única
              hoja A4 de la propuesta. Acortá el texto o verificá el PDF antes de enviarlo.
            </p>
          )}
        </div>

        {configError && <p className="text-xs text-destructive">{configError}</p>}

        <button
          type="submit"
          disabled={savingConfig}
          className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {savingConfig ? 'Guardando...' : 'Guardar parámetros'}
        </button>
      </form>

      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Escalones por volumen</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Descuento según cantidad. Máx. vacío = sin tope.
            </p>
          </div>
          <button
            onClick={() => setEscalones((prev) => prev && [...prev, { cantidadMin: '', cantidadMax: '', descuentoPct: '' }])}
            className="flex items-center gap-1 px-2.5 py-1 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus size={12} />
            Agregar
          </button>
        </div>

        {escalones.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">Sin escalones: no se aplica descuento por volumen.</p>
        ) : (
          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_1fr_1fr_28px] gap-2 text-[11px] text-muted-foreground px-0.5">
              <span>Desde (u.)</span>
              <span>Hasta (u.)</span>
              <span>Desc. (%)</span>
              <span />
            </div>
            {escalones.map((esc, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_1fr_28px] gap-2 items-center">
                <input
                  type="number" inputMode="numeric" min="1" step="1"
                  value={esc.cantidadMin}
                  onChange={(e) =>
                    setEscalones((prev) => prev && prev.map((p, i) => (i === index ? { ...p, cantidadMin: e.target.value } : p)))
                  }
                  className={inputClass}
                />
                <input
                  type="number" inputMode="numeric" min="1" step="1"
                  placeholder="Sin tope"
                  value={esc.cantidadMax}
                  onChange={(e) =>
                    setEscalones((prev) => prev && prev.map((p, i) => (i === index ? { ...p, cantidadMax: e.target.value } : p)))
                  }
                  className={inputClass}
                />
                <input
                  type="number" inputMode="decimal" min="0" max="100" step="0.01"
                  value={esc.descuentoPct}
                  onChange={(e) =>
                    setEscalones((prev) => prev && prev.map((p, i) => (i === index ? { ...p, descuentoPct: e.target.value } : p)))
                  }
                  className={inputClass}
                />
                <button
                  onClick={() => setEscalones((prev) => prev && prev.filter((_, i) => i !== index))}
                  className="p-1.5 text-muted-foreground hover:text-destructive rounded transition-colors justify-self-center"
                  title="Quitar escalón"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {escalonesError && <p className="mt-2 text-xs text-destructive">{escalonesError}</p>}

        <button
          onClick={handleSaveEscalones}
          disabled={savingEscalones}
          className="mt-3 px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {savingEscalones ? 'Guardando...' : 'Guardar escalones'}
        </button>
      </div>
    </section>
  )
}
