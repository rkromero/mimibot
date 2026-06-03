'use client'

import { useState } from 'react'
import { useToast } from '@/components/shared/ToastProvider'

export type DocTipo = 'remito' | 'proforma' | 'etiqueta'

type Generating = { pedidoId: string; tipo: DocTipo } | null

function printBlob(url: string) {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  iframe.style.opacity = '0'
  iframe.style.pointerEvents = 'none'

  function cleanup() {
    try { document.body.removeChild(iframe) } catch { /* already removed */ }
    URL.revokeObjectURL(url)
  }

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch {
      // Iframe print blocked — open in new tab as fallback
      window.open(url, '_blank')
      cleanup()
      return
    }
    // Clean up after the user closes the print dialog.
    // afterprint fires in Chrome/Firefox; setTimeout is the fallback.
    const win = iframe.contentWindow
    if (win) {
      win.addEventListener('afterprint', cleanup, { once: true })
    }
    // Safety timeout: revoke after 3 minutes even if afterprint never fires
    setTimeout(cleanup, 3 * 60 * 1000)
  }

  iframe.onerror = () => {
    window.open(url, '_blank')
    cleanup()
  }

  document.body.appendChild(iframe)
  iframe.src = url
}

export function useGenerarDocumento() {
  const [generating, setGenerating] = useState<Generating>(null)
  const toast = useToast()

  async function generarDocumento(pedidoId: string, tipo: DocTipo) {
    if (generating) return
    setGenerating({ pedidoId, tipo })
    try {
      let res: Response

      if (tipo === 'etiqueta') {
        res = await fetch(`/api/pedidos/${pedidoId}/etiqueta`)
      } else {
        res = await fetch(`/api/pedidos/${pedidoId}/documentos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo }),
        })
      }

      if (!res.ok) {
        let errMsg = 'Error al generar documento'
        try {
          const data = await res.json() as { error?: string }
          if (data.error) errMsg = data.error
        } catch { /* non-JSON body */ }
        toast.error(errMsg)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      printBlob(url)
    } catch {
      toast.error('Error de conexión al generar documento')
    } finally {
      setGenerating(null)
    }
  }

  function isGenerating(pedidoId: string, tipo: DocTipo): boolean {
    return generating?.pedidoId === pedidoId && generating.tipo === tipo
  }

  function anyGenerating(pedidoId: string): boolean {
    return generating?.pedidoId === pedidoId
  }

  return { generarDocumento, isGenerating, anyGenerating }
}
