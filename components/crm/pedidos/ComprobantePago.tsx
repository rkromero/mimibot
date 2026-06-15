'use client'

import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, ImageIcon, Upload, X } from 'lucide-react'
import { useToast } from '@/components/shared/ToastProvider'
import { esRolTipoAgent } from '@/lib/authz/roles'

type Props = {
  pedidoId: string
  role: string | undefined
  estado: string
}

export default function ComprobantePago({ pedidoId, role, estado }: Props) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const canUpload =
    role === 'admin' ||
    (esRolTipoAgent(role) && (estado === 'pendiente' || estado === 'pendiente_aprobacion'))

  const { data, isLoading, isError } = useQuery<{ url: string | null; missingComprobante: boolean }>({
    queryKey: ['comprobante-pago', pedidoId],
    queryFn: async () => {
      const res = await fetch(`/api/pedidos/${pedidoId}/comprobante-pago`)
      if (!res.ok) throw new Error('Error al cargar')
      return res.json()
    },
    staleTime: 60_000,
    enabled: role !== 'vendedor',
  })

  if (role === 'vendedor') return null

  const url = data?.url ?? null
  const isPdf = url ? url.split('?')[0]?.toLowerCase().endsWith('.pdf') : false

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/pedidos/${pedidoId}/comprobante-pago`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const body = await res.json() as { error: string }
        throw new Error(body.error ?? 'Error al subir')
      }
      void queryClient.invalidateQueries({ queryKey: ['comprobante-pago', pedidoId] })
      toast.success('Comprobante adjuntado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al subir comprobante')
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = async () => {
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/comprobante-pago`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json() as { error: string }
        throw new Error(body.error ?? 'Error al quitar comprobante')
      }
      void queryClient.invalidateQueries({ queryKey: ['comprobante-pago', pedidoId] })
      toast.success('Comprobante eliminado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al quitar comprobante')
    }
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">Comprobante de pago</h3>
      <div className="bg-card border border-border rounded-lg p-4">
        {canUpload && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={(e) => { void handleFileChange(e) }}
          />
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}
        {isError && <p className="text-sm text-destructive">Error al cargar el comprobante.</p>}

        {!isLoading && !isError && data?.missingComprobante && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImageIcon size={16} />
              Sin comprobante adjunto
            </div>
            {canUpload && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
              >
                <Upload size={14} />
                {uploading ? 'Subiendo...' : 'Adjuntar'}
              </button>
            )}
          </div>
        )}

        {!isLoading && !isError && url && (
          <div className="space-y-3">
            {isPdf ? (
              <div className="flex items-center gap-2 text-sm">
                <FileText size={16} className="text-muted-foreground" />
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Ver comprobante PDF
                </a>
              </div>
            ) : (
              <img
                src={url}
                alt="Comprobante de pago"
                className="max-w-full max-h-80 rounded-md border border-border object-contain"
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors"
              >
                <Download size={13} />
                Descargar
              </a>
              {canUpload && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    <Upload size={13} />
                    {uploading ? 'Subiendo...' : 'Reemplazar'}
                  </button>
                  <button
                    onClick={() => { void handleRemove() }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <X size={13} />
                    Quitar
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
