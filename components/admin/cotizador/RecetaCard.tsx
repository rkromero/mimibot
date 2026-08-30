'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Copy, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/shared/ToastProvider'
import { calcularCostoUnitario, type InsumoPrecio } from '@/lib/costos/calculo'
import { inputClass, type Insumo } from './InsumosSection'

export type RecetaItem = {
  recetaId: string
  insumoId: string
  gramos: string
  cantidad: string | null
  insumo: Insumo
}

export type CostoReceta = {
  costoMateriaPrima: number
  costoPackaging: number
  costoUnitario: number
  detalle: { insumoId: string; nombre: string; cantidad: number; costo: number }[]
  omitidos: string[]
}

export type Receta = {
  id: string
  nombre: string
  gramaje: number
  clienteId: string | null
  esCotizador: boolean
  bobinaInsumoId: string | null
  cajaInsumoId: string | null
  alfajoresPorCaja: number | null
  margenPct: string | null
  activo: boolean
  updatedAt: string
  items: RecetaItem[]
  cliente: { id: string; nombre: string; apellido: string } | null
  costo: CostoReceta
}

export type ConfigGlobal = { margenPct: number | null; alfajoresPorCaja: number | null }

type DraftItem = { insumoId: string; cantidad: string }

export const fmtMonto = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function RecetaCard({
  receta,
  insumos,
  config,
  onChanged,
  onBaja,
  onDuplicar,
}: {
  receta: Receta
  insumos: Insumo[]
  config: ConfigGlobal
  onChanged: () => void
  onBaja: () => void
  onDuplicar: () => void
}) {
  const toast = useToast()
  const activos = insumos.filter((i) => i.activo)
  const porUnidad = activos.filter((i) => i.unidad === 'unidad')

  const [nombre, setNombre] = useState(receta.nombre)
  const [items, setItems] = useState<DraftItem[]>(
    receta.items.map((i) => ({ insumoId: i.insumoId, cantidad: i.cantidad ?? i.gramos })),
  )
  const [bobinaId, setBobinaId] = useState(receta.bobinaInsumoId ?? '')
  const [cajaId, setCajaId] = useState(receta.cajaInsumoId ?? '')
  const [porCaja, setPorCaja] = useState(receta.alfajoresPorCaja != null ? String(receta.alfajoresPorCaja) : '')
  const [margen, setMargen] = useState(receta.margenPct != null ? String(Number(receta.margenPct)) : '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  function unidadDe(insumoId: string): Insumo['unidad'] | null {
    return insumos.find((i) => i.id === insumoId)?.unidad ?? null
  }
  function nombreInsumo(id: string): string {
    return insumos.find((i) => i.id === id)?.nombre
      ?? receta.items.find((i) => i.insumoId === id)?.insumo.nombre
      ?? 'Insumo'
  }

  // Costo EN VIVO con el mismo motor que usa el backend (lib/costos/calculo):
  // lo que se ve acá coincide con lo que devuelve el endpoint al guardar.
  const costoVivo = useMemo(() => {
    const precios = new Map<string, InsumoPrecio>(
      activos.map((i) => [i.id, { id: i.id, nombre: i.nombre, unidad: i.unidad, precio: Number(i.precio) }]),
    )
    try {
      return calcularCostoUnitario({
        items: items
          .filter((i) => Number(i.cantidad) > 0)
          .map((i) => ({ insumoId: i.insumoId, cantidad: Number(i.cantidad) })),
        bobinaInsumoId: bobinaId || null,
        cajaInsumoId: cajaId || null,
        alfajoresPorCaja: porCaja === '' ? (config.alfajoresPorCaja ?? 12) : Number(porCaja),
      }, precios)
    } catch {
      return null
    }
  }, [items, bobinaId, cajaId, porCaja, activos, config.alfajoresPorCaja])

  const usados = new Set(items.map((i) => i.insumoId))
  const disponibles = activos.filter((i) => !usados.has(i.id))
  // La suma contra el gramaje solo tiene sentido para los componentes por kg
  const sumaKg = items.reduce(
    (acc, i) => (unidadDe(i.insumoId) === 'kg' ? acc + (Number(i.cantidad) || 0) : acc),
    0,
  )
  const sumaOk = Math.abs(sumaKg - receta.gramaje) < 0.005

  async function patch(body: Record<string, unknown>, okMsg: string) {
    setError(null)
    setIsSaving(true)
    try {
      const res = await fetch(`/api/admin/cotizador/recetas/${receta.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error ?? 'Error al guardar')
        return
      }
      onChanged()
      toast.success(okMsg)
    } catch {
      setError('Error de conexión')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSave() {
    if (!nombre.trim()) { setError('El nombre es requerido'); return }
    const payload = items.map((i) => ({ insumoId: i.insumoId, cantidad: Number(i.cantidad) }))
    if (payload.some((i) => !Number.isFinite(i.cantidad) || i.cantidad <= 0)) {
      setError('Todos los componentes necesitan una cantidad mayor a 0')
      return
    }
    const porCajaNum = porCaja === '' ? null : Number(porCaja)
    if (porCajaNum !== null && (!Number.isInteger(porCajaNum) || porCajaNum <= 0)) {
      setError('Alfajores por caja debe ser un entero mayor a 0')
      return
    }
    const margenNum = margen === '' ? null : Number(margen)
    if (margenNum !== null && (!Number.isFinite(margenNum) || margenNum < 0 || margenNum >= 100)) {
      setError('El margen debe estar entre 0 y menos de 100')
      return
    }
    await patch({
      nombre: nombre.trim(),
      items: payload,
      bobinaInsumoId: bobinaId || null,
      cajaInsumoId: cajaId || null,
      alfajoresPorCaja: porCajaNum,
      margenPct: margenNum,
    }, `Receta "${nombre.trim()}" guardada`)
  }

  async function handleReactivar() {
    await patch({ activo: true }, `Receta "${receta.nombre}" reactivada`)
  }

  const pill = 'inline-flex px-1.5 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap'

  return (
    <div className={cn('border border-border rounded-lg p-3', !receta.activo && 'opacity-60')}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={cn(inputClass, 'font-semibold')}
            aria-label="Nombre de la receta"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">{receta.gramaje} g</span>
        </div>
        <div className="flex items-center gap-1">
          {receta.esCotizador && <span className={cn(pill, 'bg-primary/10 text-primary')}>Cotizador</span>}
          {!receta.activo && (
            <span className={cn(pill, 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400')}>Inactiva</span>
          )}
          <button
            onClick={onDuplicar}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            title="Duplicar para un cliente"
          >
            <Copy size={13} />
          </button>
          {receta.activo ? (
            <button
              onClick={onBaja}
              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
              title="Dar de baja"
            >
              <Trash2 size={13} />
            </button>
          ) : (
            <button
              onClick={handleReactivar}
              disabled={isSaving}
              className="px-2 py-1 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Reactivar
            </button>
          )}
        </div>
      </div>
      {receta.cliente && (
        <p className="text-xs text-muted-foreground mb-2">
          Cliente: {receta.cliente.nombre} {receta.cliente.apellido}
        </p>
      )}

      <div className="space-y-1.5">
        {items.map((item, index) => {
          const unidad = unidadDe(item.insumoId)
          return (
            <div key={item.insumoId} className="flex items-center gap-2">
              <span className="flex-1 text-xs text-foreground truncate">{nombreInsumo(item.insumoId)}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={item.cantidad}
                onChange={(e) =>
                  setItems((prev) => prev.map((p, i) => (i === index ? { ...p, cantidad: e.target.value } : p)))
                }
                aria-label={unidad === 'unidad' ? 'Unidades' : 'Gramos'}
                className={cn(inputClass, 'w-24 text-right')}
              />
              <span className="text-xs text-muted-foreground w-4">{unidad === 'unidad' ? 'u' : 'g'}</span>
              <button
                onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                title="Quitar componente"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )
        })}
        {items.length === 0 && <p className="text-xs text-muted-foreground">Sin componentes</p>}
      </div>

      {disponibles.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) setItems((prev) => [...prev, { insumoId: e.target.value, cantidad: '' }])
          }}
          className={cn(inputClass, 'mt-2 text-muted-foreground')}
        >
          <option value="">+ Agregar componente...</option>
          {disponibles.map((i) => (
            <option key={i.id} value={i.id}>{i.nombre} ({i.unidad === 'kg' ? 'kg' : 'unidad'})</option>
          ))}
        </select>
      )}

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Bobina</label>
          <select value={bobinaId} onChange={(e) => setBobinaId(e.target.value)} className={inputClass}>
            <option value="">Sin bobina</option>
            {porUnidad.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Caja</label>
          <select value={cajaId} onChange={(e) => setCajaId(e.target.value)} className={inputClass}>
            <option value="">Sin caja</option>
            {porUnidad.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Alfajores por caja</label>
          <input
            type="number" inputMode="numeric" min="1" step="1"
            value={porCaja}
            onChange={(e) => setPorCaja(e.target.value)}
            placeholder={config.alfajoresPorCaja != null ? `Global: ${config.alfajoresPorCaja}` : 'Ej: 12'}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Margen %</label>
          <input
            type="number" inputMode="decimal" min="0" max="99.99" step="0.01"
            value={margen}
            onChange={(e) => setMargen(e.target.value)}
            placeholder={config.margenPct != null ? `Hereda: ${config.margenPct}% (global)` : 'Hereda del global'}
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-3 border border-border rounded-md p-2 bg-muted/30">
        <p className="text-xs font-medium text-foreground mb-1">Costo unitario en vivo</p>
        {costoVivo ? (
          <>
            {costoVivo.detalle.map((d) => (
              <div key={d.insumoId} className="flex justify-between text-xs text-muted-foreground">
                <span>{d.nombre} — {d.cantidad} {unidadDe(d.insumoId) === 'unidad' ? 'u' : 'g'}</span>
                <span>$ {fmtMonto(d.costo)}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs text-foreground mt-1">
              <span>Materia prima</span><span>$ {fmtMonto(costoVivo.costoMateriaPrima)}</span>
            </div>
            <div className="flex justify-between text-xs text-foreground">
              <span>Packaging</span><span>$ {fmtMonto(costoVivo.costoPackaging)}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold text-foreground border-t border-border mt-1 pt-1">
              <span>Costo unitario</span><span>$ {fmtMonto(costoVivo.costoUnitario)}</span>
            </div>
            {costoVivo.omitidos.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Fuera del costo (inactivos o inexistentes): {costoVivo.omitidos.map(nombreInsumo).join(', ')}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-destructive">Alfajores por caja debe ser mayor a 0</p>
        )}
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className={cn('inline-flex items-center gap-1 text-xs', sumaOk ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400')}>
          {!sumaOk && <AlertTriangle size={12} />}
          Suma kg: {sumaKg.toLocaleString('es-AR', { maximumFractionDigits: 2 })} g
          {!sumaOk && ` — no coincide con ${receta.gramaje} g`}
        </span>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-3 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  )
}
