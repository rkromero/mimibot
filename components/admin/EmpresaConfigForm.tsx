'use client'

import { useState, useEffect, useTransition } from 'react'
import { cn } from '@/lib/utils'

type EmpresaConfigData = {
  id: number
  nombre: string
  direccion: string | null
  telefono: string | null
  email: string | null
}

const EMPTY_CONFIG: EmpresaConfigData = {
  id: 1,
  nombre: '',
  direccion: null,
  telefono: null,
  email: null,
}

export default function EmpresaConfigForm() {
  const [config, setConfig] = useState<EmpresaConfigData>(EMPTY_CONFIG)
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  function handleChange(field: keyof EmpresaConfigData, value: string) {
    setConfig((prev) => ({ ...prev, [field]: value || null }))
    setSaved(false)
    setError(null)
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
            telefono: config.telefono?.trim() || null,
            email: config.email?.trim() || null,
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
            'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          )}
        />
      </div>

      {/* Direccion */}
      <div className="space-y-1.5">
        <label htmlFor="direccion" className="block text-sm font-medium text-foreground">
          Direccion
        </label>
        <input
          id="direccion"
          type="text"
          value={config.direccion ?? ''}
          onChange={(e) => handleChange('direccion', e.target.value)}
          placeholder="Ej: Av. Corrientes 1234, CABA"
          className={cn(
            'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          )}
        />
      </div>

      {/* Telefono */}
      <div className="space-y-1.5">
        <label htmlFor="telefono" className="block text-sm font-medium text-foreground">
          Telefono
        </label>
        <input
          id="telefono"
          type="tel"
          value={config.telefono ?? ''}
          onChange={(e) => handleChange('telefono', e.target.value)}
          placeholder="Ej: +54 11 4444-5555"
          className={cn(
            'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
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
            'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
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
          'bg-foreground text-background hover:bg-foreground/90',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      >
        {isPending ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </form>
  )
}
