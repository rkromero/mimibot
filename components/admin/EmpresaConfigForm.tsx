'use client'

import { useState, useEffect, useTransition } from 'react'
import { cn } from '@/lib/utils'

type EmpresaConfigData = {
  id: number
  nombre: string
  direccion: string | null
  localidad: string | null
  provincia: string | null
  telefono: string | null
  email: string | null
  cuit: string | null
  condicionIva: string | null
  puntoVenta: string | null
  depotLat: number | null
  depotLng: number | null
}

type BackfillResult = {
  procesados: number
  exitosos: number
  fallidos: number
}

const EMPTY_CONFIG: EmpresaConfigData = {
  id: 1,
  nombre: '',
  direccion: null,
  localidad: null,
  provincia: null,
  telefono: null,
  email: null,
  cuit: '30-71751033-6',
  condicionIva: 'Responsable Inscripto',
  puntoVenta: '0001',
  depotLat: null,
  depotLng: null,
}

export default function EmpresaConfigForm() {
  const [config, setConfig] = useState<EmpresaConfigData>(EMPTY_CONFIG)
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isBackfilling, setIsBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null)
  const [backfillError, setBackfillError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch('/api/admin/empresa-config')
        if (!res.ok) throw new Error('Error al cargar la configuración')
        const json = (await res.json()) as { data: EmpresaConfigData }
        setConfig(json.data)
      } catch {
        setError('No se pudo cargar la configuración de empresa')
      } finally {
        setLoading(false)
      }
    }

    void fetchConfig()
  }, [])

  type StringFields = 'nombre' | 'direccion' | 'localidad' | 'provincia' | 'telefono' | 'email' | 'cuit' | 'condicionIva' | 'puntoVenta'

  function handleChange(field: StringFields, value: string) {
    setConfig((prev) => ({ ...prev, [field]: value || null }))
    setSaved(false)
    setError(null)
  }

  async function handleBackfill() {
    setBackfillError(null)
    setBackfillResult(null)
    setIsBackfilling(true)
    try {
      const res = await fetch('/api/admin/geocode/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      })
      const json = await res.json() as { error?: string } & Partial<BackfillResult>
      if (!res.ok) {
        setBackfillError(json.error ?? 'Error al re-geocodificar')
        return
      }
      setBackfillResult({
        procesados: json.procesados ?? 0,
        exitosos: json.exitosos ?? 0,
        fallidos: json.fallidos ?? 0,
      })
    } catch {
      setBackfillError('Error de conexión')
    } finally {
      setIsBackfilling(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (!config.nombre.trim()) {
      setError('El nombre de la empresa es obligatorio')
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/empresa-config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: config.nombre.trim(),
            direccion: config.direccion?.trim() || null,
            localidad: config.localidad?.trim() || null,
            provincia: config.provincia?.trim() || null,
            telefono: config.telefono?.trim() || null,
            email: config.email?.trim() || null,
            cuit: config.cuit?.trim() || null,
            condicionIva: config.condicionIva?.trim() || null,
            puntoVenta: config.puntoVenta?.trim() || null,
            depotLat: config.depotLat,
            depotLng: config.depotLng,
          }),
        })

        const json = (await res.json()) as { error?: string; data?: EmpresaConfigData }

        if (!res.ok) {
          setError(json.error ?? 'Error al guardar')
          return
        }

        if (json.data) setConfig(json.data)
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
    <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-5">
      {/* Nombre */}
      <div className="space-y-1.5">
        <label htmlFor="nombre" className="block text-sm font-medium text-foreground">
          Nombre de la empresa <span className="text-red-500">*</span>
        </label>
        <input
          id="nombre"
          type="text"
          value={config.nombre}
          onChange={(e) => handleChange('nombre', e.target.value)}
          placeholder="Ej: Distribuidora Rodriguez S.A."
          required
          className={cn(
            'w-full rounded-md border border-input bg-background px-3 py-2.5 md:py-2 text-[16px] md:text-sm',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          )}
        />
      </div>

      {/* Dirección */}
      <div className="space-y-1.5">
        <label htmlFor="direccion" className="block text-sm font-medium text-foreground">
          Dirección (calle y número)
        </label>
        <input
          id="direccion"
          type="text"
          value={config.direccion ?? ''}
          onChange={(e) => handleChange('direccion', e.target.value)}
          placeholder="Ej: Jose Ignacio de la Rosa 6276"
          className={cn(
            'w-full rounded-md border border-input bg-background px-3 py-2.5 md:py-2 text-[16px] md:text-sm',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          )}
        />
      </div>

      {/* Localidad */}
      <div className="space-y-1.5">
        <label htmlFor="localidad" className="block text-sm font-medium text-foreground">
          Localidad (ciudad)
        </label>
        <input
          id="localidad"
          type="text"
          value={config.localidad ?? ''}
          onChange={(e) => handleChange('localidad', e.target.value)}
          placeholder="Ej: Ciudad Autónoma de Buenos Aires"
          className={cn(
            'w-full rounded-md border border-input bg-background px-3 py-2.5 md:py-2 text-[16px] md:text-sm',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          )}
        />
      </div>

      {/* Provincia */}
      <div className="space-y-1.5">
        <label htmlFor="provincia" className="block text-sm font-medium text-foreground">
          Provincia
        </label>
        <select
          id="provincia"
          value={config.provincia ?? ''}
          onChange={(e) => handleChange('provincia', e.target.value)}
          className={cn(
            'w-full rounded-md border border-input bg-background px-3 py-2.5 md:py-2 text-[16px] md:text-sm',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          )}
        >
          <option value="">Seleccionar provincia</option>
          <option>Buenos Aires</option>
          <option>CABA</option>
          <option>Catamarca</option>
          <option>Chaco</option>
          <option>Chubut</option>
          <option>Córdoba</option>
          <option>Corrientes</option>
          <option>Entre Ríos</option>
          <option>Formosa</option>
          <option>Jujuy</option>
          <option>La Pampa</option>
          <option>La Rioja</option>
          <option>Mendoza</option>
          <option>Misiones</option>
          <option>Neuquén</option>
          <option>Río Negro</option>
          <option>Salta</option>
          <option>San Juan</option>
          <option>San Luis</option>
          <option>Santa Cruz</option>
          <option>Santa Fe</option>
          <option>Santiago del Estero</option>
          <option>Tierra del Fuego</option>
          <option>Tucumán</option>
        </select>
      </div>

      {/* Coordenadas del depósito (respaldo manual) */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-foreground">
          Coordenadas del depósito (opcional — respaldo manual)
        </label>
        <p className="text-xs text-muted-foreground">
          Se geocodifica automáticamente al guardar dirección/localidad/provincia. Completá a mano solo si el geocoding falla.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            step="any"
            value={config.depotLat ?? ''}
            onChange={(e) => setConfig((prev) => ({ ...prev, depotLat: e.target.value ? parseFloat(e.target.value) : null }))}
            placeholder="Latitud (-34.6037…)"
            className={cn(
              'w-full rounded-md border border-input bg-background px-3 py-2.5 md:py-2 text-[16px] md:text-sm',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
            )}
          />
          <input
            type="number"
            step="any"
            value={config.depotLng ?? ''}
            onChange={(e) => setConfig((prev) => ({ ...prev, depotLng: e.target.value ? parseFloat(e.target.value) : null }))}
            placeholder="Longitud (-58.3816…)"
            className={cn(
              'w-full rounded-md border border-input bg-background px-3 py-2.5 md:py-2 text-[16px] md:text-sm',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
            )}
          />
        </div>
      </div>

      {/* Teléfono */}
      <div className="space-y-1.5">
        <label htmlFor="telefono" className="block text-sm font-medium text-foreground">
          Teléfono
        </label>
        <input
          id="telefono"
          type="tel"
          value={config.telefono ?? ''}
          onChange={(e) => handleChange('telefono', e.target.value)}
          placeholder="Ej: +54 11 4444-5555"
          className={cn(
            'w-full rounded-md border border-input bg-background px-3 py-2.5 md:py-2 text-[16px] md:text-sm',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          )}
        />
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium text-foreground">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={config.email ?? ''}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="Ej: contacto@empresa.com"
          className={cn(
            'w-full rounded-md border border-input bg-background px-3 py-2.5 md:py-2 text-[16px] md:text-sm',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          )}
        />
      </div>

      {/* CUIT */}
      <div className="space-y-1.5">
        <label htmlFor="cuit" className="block text-sm font-medium text-foreground">
          CUIT
        </label>
        <input
          id="cuit"
          type="text"
          value={config.cuit ?? ''}
          onChange={(e) => handleChange('cuit', e.target.value)}
          placeholder="Ej: 30-71751033-6"
          className={cn(
            'w-full rounded-md border border-input bg-background px-3 py-2.5 md:py-2 text-[16px] md:text-sm',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          )}
        />
      </div>

      {/* Condición IVA */}
      <div className="space-y-1.5">
        <label htmlFor="condicionIva" className="block text-sm font-medium text-foreground">
          Condición IVA
        </label>
        <input
          id="condicionIva"
          type="text"
          value={config.condicionIva ?? ''}
          onChange={(e) => handleChange('condicionIva', e.target.value)}
          placeholder="Ej: Responsable Inscripto"
          className={cn(
            'w-full rounded-md border border-input bg-background px-3 py-2.5 md:py-2 text-[16px] md:text-sm',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          )}
        />
      </div>

      {/* Punto de Venta */}
      <div className="space-y-1.5">
        <label htmlFor="puntoVenta" className="block text-sm font-medium text-foreground">
          Punto de Venta
        </label>
        <input
          id="puntoVenta"
          type="text"
          value={config.puntoVenta ?? ''}
          onChange={(e) => handleChange('puntoVenta', e.target.value)}
          placeholder="Ej: 0001"
          className={cn(
            'w-full rounded-md border border-input bg-background px-3 py-2.5 md:py-2 text-[16px] md:text-sm',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          )}
        />
      </div>

      {/* Feedback */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
          Configuracion guardada correctamente
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className={cn(
          'w-full sm:w-auto px-5 py-2 rounded-md text-sm font-medium transition-colors duration-100',
          'bg-primary text-primary-foreground hover:bg-primary/90',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      >
        {isPending ? 'Guardando...' : 'Guardar cambios'}
      </button>

      {/* Re-geocodificar todos */}
      <div className="border-t border-border pt-5 space-y-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Geocodificación de clientes</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Re-geocodifica todos los clientes con dirección, pisando coordenadas anteriores. Puede tardar varios minutos según la cantidad de clientes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => { void handleBackfill() }}
          disabled={isBackfilling}
          className={cn(
            'w-full sm:w-auto px-5 py-2 rounded-md text-sm font-medium transition-colors duration-100',
            'border border-border text-foreground hover:bg-accent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {isBackfilling ? 'Geocodificando...' : 'Re-geocodificar todos'}
        </button>

        {backfillError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {backfillError}
          </p>
        )}

        {backfillResult && (
          <div className="text-sm bg-muted rounded-md px-3 py-2 space-y-0.5">
            <p className="font-medium text-foreground">Resultado del backfill</p>
            <p className="text-muted-foreground">Procesados: <span className="text-foreground">{backfillResult.procesados}</span></p>
            <p className="text-muted-foreground">Exitosos: <span className="text-green-700 dark:text-green-400 font-medium">{backfillResult.exitosos}</span></p>
            <p className="text-muted-foreground">Fallidos: <span className={backfillResult.fallidos > 0 ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-foreground'}>{backfillResult.fallidos}</span></p>
          </div>
        )}
      </div>
    </form>
  )
}
