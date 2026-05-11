'use client'

import { useState, useEffect, useTransition } from 'react'
import { cn } from '@/lib/utils'

type BusinessConfigData = {
  clienteNuevoMinPedidos: number
  clienteNuevoVentanaDias: number
  clienteNuevoMontoMinimo: string | null
  clienteActivoDias: number
  clienteInactivoDias: number
  clientePerdidoDias: number
  clienteMorosoDias: number
  alertaLeadHoras: number
  alertaMetaDia: number
  alertaMetaPct: string
}

type FormState = {
  clienteNuevoMinPedidos: string
  clienteNuevoVentanaDias: string
  clienteNuevoMontoMinimo: string
  clienteActivoDias: string
  clienteInactivoDias: string
  clientePerdidoDias: string
  clienteMorosoDias: string
  alertaLeadHoras: string
  alertaMetaDia: string
  alertaMetaPct: string
}

const DEFAULT_FORM: FormState = {
  clienteNuevoMinPedidos: '3',
  clienteNuevoVentanaDias: '90',
  clienteNuevoMontoMinimo: '',
  clienteActivoDias: '60',
  clienteInactivoDias: '90',
  clientePerdidoDias: '180',
  clienteMorosoDias: '30',
  alertaLeadHoras: '24',
  alertaMetaDia: '20',
  alertaMetaPct: '0.50',
}

function dataToForm(data: BusinessConfigData): FormState {
  return {
    clienteNuevoMinPedidos: String(data.clienteNuevoMinPedidos),
    clienteNuevoVentanaDias: String(data.clienteNuevoVentanaDias),
    clienteNuevoMontoMinimo: data.clienteNuevoMontoMinimo ?? '',
    clienteActivoDias: String(data.clienteActivoDias),
    clienteInactivoDias: String(data.clienteInactivoDias),
    clientePerdidoDias: String(data.clientePerdidoDias),
    clienteMorosoDias: String(data.clienteMorosoDias),
    alertaLeadHoras: String(data.alertaLeadHoras),
    alertaMetaDia: String(data.alertaMetaDia),
    alertaMetaPct: String(data.alertaMetaPct),
  }
}

const inputClass = cn(
  'w-full rounded-md border border-input bg-background px-3 py-2.5 md:py-2 text-[16px] md:text-sm',
  'placeholder:text-muted-foreground',
  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
)

export default function BusinessConfigForm() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recalculating, setRecalculating] = useState(false)
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null)
  const [recalcEstados, setRecalcEstados] = useState(false)
  const [recalcEstadosMsg, setRecalcEstadosMsg] = useState<string | null>(null)

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch('/api/admin/business-config')
        if (!res.ok) throw new Error('Error al cargar')
        const json = (await res.json()) as { data: BusinessConfigData }
        setForm(dataToForm(json.data))
      } catch {
        setError('No se pudo cargar la configuración del negocio')
      } finally {
        setLoading(false)
      }
    }
    void fetchConfig()
  }, [])

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
    setError(null)
  }

  function parsePayload() {
    const toInt = (v: string) => {
      const n = parseInt(v, 10)
      return isNaN(n) ? null : n
    }
    const toFloat = (v: string) => {
      if (v.trim() === '') return null
      const n = parseFloat(v)
      return isNaN(n) ? null : n
    }

    return {
      clienteNuevoMinPedidos: toInt(form.clienteNuevoMinPedidos),
      clienteNuevoVentanaDias: toInt(form.clienteNuevoVentanaDias),
      clienteNuevoMontoMinimo: toFloat(form.clienteNuevoMontoMinimo),
      clienteActivoDias: toInt(form.clienteActivoDias),
      clienteInactivoDias: toInt(form.clienteInactivoDias),
      clientePerdidoDias: toInt(form.clientePerdidoDias),
      clienteMorosoDias: toInt(form.clienteMorosoDias),
      alertaLeadHoras: toInt(form.alertaLeadHoras),
      alertaMetaDia: toInt(form.alertaMetaDia),
      alertaMetaPct: toFloat(form.alertaMetaPct),
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    const payload = parsePayload()

    const intFields: Array<[keyof typeof payload, string]> = [
      ['clienteNuevoMinPedidos', 'Mínimo de pedidos'],
      ['clienteNuevoVentanaDias', 'Ventana en días'],
      ['clienteActivoDias', 'Días para cliente activo'],
      ['clienteInactivoDias', 'Días para inactivo'],
      ['clientePerdidoDias', 'Días para perdido'],
      ['clienteMorosoDias', 'Días de atraso para moroso'],
      ['alertaLeadHoras', 'Horas sin atender lead'],
      ['alertaMetaDia', 'Día del mes para alerta meta'],
    ]

    for (const [field, label] of intFields) {
      const val = payload[field]
      if (val === null || (typeof val === 'number' && val < 1)) {
        setError(`"${label}" debe ser un número entero mayor a 0`)
        return
      }
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/business-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        const json = (await res.json()) as { error?: string; data?: BusinessConfigData }

        if (!res.ok) {
          setError(json.error ?? 'Error al guardar')
          return
        }

        if (json.data) setForm(dataToForm(json.data))
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } catch {
        setError('Error de conexión. Intentá de nuevo.')
      }
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-sm text-muted-foreground">Cargando...</div>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-8">

      {/* Section: Cliente Nuevo */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Cliente Nuevo</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Criterios para clasificar un cliente como nuevo.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="clienteNuevoMinPedidos" className="block text-sm font-medium text-foreground">
            Mínimo de pedidos
          </label>
          <input
            id="clienteNuevoMinPedidos"
            type="number"
            min={1}
            step={1}
            value={form.clienteNuevoMinPedidos}
            onChange={(e) => handleChange('clienteNuevoMinPedidos', e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="clienteNuevoVentanaDias" className="block text-sm font-medium text-foreground">
            Ventana en días
          </label>
          <input
            id="clienteNuevoVentanaDias"
            type="number"
            min={1}
            step={1}
            value={form.clienteNuevoVentanaDias}
            onChange={(e) => handleChange('clienteNuevoVentanaDias', e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="clienteNuevoMontoMinimo" className="block text-sm font-medium text-foreground">
            Monto mínimo acumulado (opcional)
          </label>
          <input
            id="clienteNuevoMontoMinimo"
            type="number"
            min={0}
            step={0.01}
            value={form.clienteNuevoMontoMinimo}
            onChange={(e) => handleChange('clienteNuevoMontoMinimo', e.target.value)}
            placeholder="Sin mínimo de monto"
            className={inputClass}
          />
        </div>
      </section>

      {/* Section: Estado de Actividad */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Estado de Actividad</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Umbral de días sin pedidos para cada estado.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="clienteActivoDias" className="block text-sm font-medium text-foreground">
            Días para cliente activo
          </label>
          <input
            id="clienteActivoDias"
            type="number"
            min={1}
            step={1}
            value={form.clienteActivoDias}
            onChange={(e) => handleChange('clienteActivoDias', e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="clienteInactivoDias" className="block text-sm font-medium text-foreground">
            Días para inactivo
          </label>
          <input
            id="clienteInactivoDias"
            type="number"
            min={1}
            step={1}
            value={form.clienteInactivoDias}
            onChange={(e) => handleChange('clienteInactivoDias', e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="clientePerdidoDias" className="block text-sm font-medium text-foreground">
            Días para perdido
          </label>
          <input
            id="clientePerdidoDias"
            type="number"
            min={1}
            step={1}
            value={form.clientePerdidoDias}
            onChange={(e) => handleChange('clientePerdidoDias', e.target.value)}
            className={inputClass}
          />
        </div>
      </section>

      {/* Section: Morosidad */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Morosidad</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Días de deuda vencida para marcar a un cliente como moroso.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="clienteMorosoDias" className="block text-sm font-medium text-foreground">
            Días de atraso para moroso
          </label>
          <input
            id="clienteMorosoDias"
            type="number"
            min={1}
            step={1}
            value={form.clienteMorosoDias}
            onChange={(e) => handleChange('clienteMorosoDias', e.target.value)}
            className={inputClass}
          />
        </div>
      </section>

      {/* Section: Alertas del job diario */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Alertas (Job Diario)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Parámetros que usa el job <code className="text-xs bg-muted px-1 rounded">POST /api/jobs/alertas</code> para decidir qué alertas enviar por email.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="alertaLeadHoras" className="block text-sm font-medium text-foreground">
            Horas sin atender lead para alertar
          </label>
          <input
            id="alertaLeadHoras"
            type="number"
            min={1}
            step={1}
            value={form.alertaLeadHoras}
            onChange={(e) => handleChange('alertaLeadHoras', e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">Si un lead no tiene contacto en estas horas, aparece en el resumen.</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="alertaMetaDia" className="block text-sm font-medium text-foreground">
            Día del mes para recordatorio de metas
          </label>
          <input
            id="alertaMetaDia"
            type="number"
            min={1}
            max={28}
            step={1}
            value={form.alertaMetaDia}
            onChange={(e) => handleChange('alertaMetaDia', e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">A partir de este día del mes se incluye el recordatorio de avance de metas.</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="alertaMetaPct" className="block text-sm font-medium text-foreground">
            % mínimo de avance antes de alertar
          </label>
          <input
            id="alertaMetaPct"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={form.alertaMetaPct}
            onChange={(e) => handleChange('alertaMetaPct', e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">Ejemplo: <code className="bg-muted px-1 rounded">0.5</code> = alerta si un vendedor lleva menos del 50%.</p>
        </div>
      </section>

      {/* Feedback */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
          Configuración guardada
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className={cn(
          'w-full sm:w-auto px-5 py-2 rounded-md text-sm font-medium transition-colors duration-100',
          'bg-foreground text-background hover:bg-foreground/90',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      >
        {isPending ? 'Guardando...' : 'Guardar cambios'}
      </button>

      {/* Recalcular clientes nuevos */}
      <section className="space-y-3 pt-4 border-t border-border">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Recalcular Clientes Nuevos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Re-evalúa todos los clientes que aún no tienen fecha de conversión. Útil para actualizar datos históricos.
          </p>
        </div>
        {recalcMsg && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
            {recalcMsg}
          </p>
        )}
        <button
          type="button"
          disabled={recalculating}
          onClick={() => {
            setRecalcMsg(null)
            setRecalculating(true)
            void fetch('/api/admin/recalcular-clientes-nuevos', { method: 'POST' })
              .then(async (r) => {
                const json = (await r.json()) as { data?: { evaluated: number }; error?: string }
                if (!r.ok) {
                  setRecalcMsg(`Error: ${json.error ?? 'desconocido'}`)
                } else {
                  setRecalcMsg(`Evaluados ${json.data?.evaluated ?? 0} clientes correctamente.`)
                }
              })
              .catch(() => setRecalcMsg('Error de conexión'))
              .finally(() => setRecalculating(false))
          }}
          className={cn(
            'w-full sm:w-auto px-5 py-2 rounded-md text-sm font-medium transition-colors duration-100',
            'bg-muted text-foreground hover:bg-muted/70 border border-border',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {recalculating ? 'Recalculando...' : 'Recalcular ahora'}
        </button>
      </section>

      {/* Recalcular estados de actividad */}
      <section className="space-y-3 pt-4 border-t border-border">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Recalcular Estado de Actividad</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Re-evalúa el estado de actividad (activo / inactivo / perdido) de todos los clientes según los umbrales configurados arriba.
          </p>
        </div>
        {recalcEstadosMsg && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
            {recalcEstadosMsg}
          </p>
        )}
        <button
          type="button"
          disabled={recalcEstados}
          onClick={() => {
            setRecalcEstadosMsg(null)
            setRecalcEstados(true)
            void fetch('/api/admin/recalcular-estados-actividad', { method: 'POST' })
              .then(async (r) => {
                const json = (await r.json()) as { data?: { updated: number }; error?: string }
                if (!r.ok) {
                  setRecalcEstadosMsg(`Error: ${json.error ?? 'desconocido'}`)
                } else {
                  setRecalcEstadosMsg(`${json.data?.updated ?? 0} clientes actualizados correctamente.`)
                }
              })
              .catch(() => setRecalcEstadosMsg('Error de conexión'))
              .finally(() => setRecalcEstados(false))
          }}
          className={cn(
            'w-full sm:w-auto px-5 py-2 rounded-md text-sm font-medium transition-colors duration-100',
            'bg-muted text-foreground hover:bg-muted/70 border border-border',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {recalcEstados ? 'Recalculando...' : 'Recalcular ahora'}
        </button>
      </section>
    </form>
  )
}
