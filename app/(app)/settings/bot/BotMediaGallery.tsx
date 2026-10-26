'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { CATEGORIAS_BOT_MEDIA, LABEL_CATEGORIA, type CategoriaBotMedia } from '@/lib/claude/bot-reglas'

type Medio = {
  id: string
  categoria: CategoriaBotMedia
  titulo: string
  descripcion: string | null
  r2Key: string
  mimeType: string
  orden: number
  activo: boolean
}

const inputCls = cn(
  'w-full px-3 py-2 text-sm rounded-md border',
  'border-border bg-background text-foreground placeholder:text-muted-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
)

/**
 * Galería de fotos / videos que el bot manda cuando la persona pide ver el
 * producto, el packaging o la planta. Los archivos viven en R2.
 */
export default function BotMediaGallery() {
  const [medios, setMedios] = useState<Medio[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [form, setForm] = useState({ categoria: 'producto_terminado' as CategoriaBotMedia, titulo: '', descripcion: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch('/api/settings/bot-media')
      const data = (await res.json()) as { data?: Medio[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo cargar la galería')
      setMedios(data.data ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la galería')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function subir(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError('Elegí una foto o un video')
      return
    }
    setSubiendo(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('categoria', form.categoria)
      fd.append('titulo', form.titulo)
      fd.append('descripcion', form.descripcion)
      const res = await fetch('/api/settings/bot-media', { method: 'POST', body: fd })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo subir')
      setForm((p) => ({ ...p, titulo: '', descripcion: '' }))
      if (fileRef.current) fileRef.current.value = ''
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir')
    } finally {
      setSubiendo(false)
    }
  }

  async function patch(id: string, body: Partial<Pick<Medio, 'activo' | 'orden'>>) {
    const res = await fetch(`/api/settings/bot-media/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = (await res.json()) as { error?: string }
      setError(data.error ?? 'No se pudo actualizar')
      return
    }
    await cargar()
  }

  async function borrar(id: string) {
    if (!window.confirm('¿Sacar este medio de la galería?')) return
    const res = await fetch(`/api/settings/bot-media/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = (await res.json()) as { error?: string }
      setError(data.error ?? 'No se pudo borrar')
      return
    }
    await cargar()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-md font-semibold mb-1">Galería del bot</h2>
        <p className="text-sm text-muted-foreground">
          Fotos y videos reales que el bot manda (1 o 2 por mensaje) cuando la persona pide ver el producto,
          el flow pack cristal, la bobina impresa o la planta. El título es el epígrafe que ve el cliente.
        </p>
      </div>

      <form onSubmit={subir} className="grid gap-3 sm:grid-cols-2 border border-border rounded-lg p-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Categoría</label>
          <select
            value={form.categoria}
            onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value as CategoriaBotMedia }))}
            className={inputCls}
          >
            {CATEGORIAS_BOT_MEDIA.map((c) => (
              <option key={c} value={c}>{LABEL_CATEGORIA[c]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Archivo (JPG, PNG, WebP o MP4)</label>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4" className="text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Título (epígrafe)</label>
          <input
            value={form.titulo}
            onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
            maxLength={120}
            placeholder="Alfajor de maicena 50 g en flow pack cristal"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Descripción (interna, opcional)</label>
          <input
            value={form.descripcion}
            onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
            maxLength={500}
            placeholder="Qué se ve, para elegir el medio correcto"
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={subiendo}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground',
              'hover:bg-primary/90 transition-colors duration-100 disabled:opacity-50',
            )}
          >
            {subiendo ? 'Subiendo...' : 'Subir a la galería'}
          </button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </form>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : medios.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay medios. Sin galería, el bot no puede mandar fotos.
        </p>
      ) : (
        <div className="space-y-5">
          {CATEGORIAS_BOT_MEDIA.map((cat) => {
            const items = medios.filter((m) => m.categoria === cat)
            if (items.length === 0) return null
            return (
              <div key={cat}>
                <h3 className="text-sm font-medium mb-2">{LABEL_CATEGORIA[cat]}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {items.map((m) => (
                    <div
                      key={m.id}
                      className={cn('border border-border rounded-lg overflow-hidden', !m.activo && 'opacity-50')}
                    >
                      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                        {m.mimeType.startsWith('image/') ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/attachments/url?key=${encodeURIComponent(m.r2Key)}`}
                            alt={m.titulo}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">🎬 Video</span>
                        )}
                      </div>
                      <div className="p-2 space-y-1.5">
                        <p className="text-xs font-medium truncate" title={m.titulo}>{m.titulo}</p>
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <span>Orden</span>
                            <input
                              type="number"
                              min={0}
                              max={999}
                              defaultValue={m.orden}
                              onBlur={(e) => {
                                const n = parseInt(e.target.value, 10)
                                if (!Number.isNaN(n) && n !== m.orden) void patch(m.id, { orden: n })
                              }}
                              className="w-14 px-1.5 py-0.5 text-xs rounded border border-border bg-background"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void patch(m.id, { activo: !m.activo })}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            {m.activo ? 'Pausar' : 'Activar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void borrar(m.id)}
                            className="text-xs text-destructive hover:underline"
                          >
                            Borrar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
