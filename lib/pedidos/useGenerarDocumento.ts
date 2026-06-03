'use client'

import { useState } from 'react'
import { useToast } from '@/components/shared/ToastProvider'

type Generating = { pedidoId: string; tipo: 'remito' | 'proforma' } | null

export function useGenerarDocumento() {
  const [generating, setGenerating] = useState<Generating>(null)
  const toast = useToast()

  async function generarDocumento(pedidoId: string, tipo: 'remito' | 'proforma') {
    if (generating) return
    setGenerating({ pedidoId, tipo })
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/documentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        toast.error(data.error ?? 'Error al generar documento')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="([^"]+)"/)
      a.download = match?.[1] ?? `${tipo}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Error de conexión al generar documento')
    } finally {
      setGenerating(null)
    }
  }

  function isGenerating(pedidoId: string, tipo: 'remito' | 'proforma'): boolean {
    return generating?.pedidoId === pedidoId && generating.tipo === tipo
  }

  function anyGenerating(pedidoId: string): boolean {
    return generating?.pedidoId === pedidoId
  }

  return { generarDocumento, isGenerating, anyGenerating }
}
