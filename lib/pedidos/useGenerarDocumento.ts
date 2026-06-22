'use client'

import { useState } from 'react'
import { useToast } from '@/components/shared/ToastProvider'

export type DocTipo = 'remito' | 'proforma' | 'etiqueta'

type Generating = { pedidoId: string; tipo: DocTipo } | null

function printBlob(url: string) {
  const iframe = document.createElement('iframe')

  // Off-screen with real dimensions — Chrome needs actual size to initialise
  // its built-in PDF viewer; a 0×0 iframe leaves the viewer uninitialised and
  // causes contentWindow.print() to delegate to the parent window instead.
  iframe.style.cssText =
    'position:fixed;top:-9999px;left:-9999px;width:800px;height:600px;border:0;visibility:hidden'

  let cleanedUp = false
  function cleanup() {
    if (cleanedUp) return
    cleanedUp = true
    try { document.body.removeChild(iframe) } catch { /* already removed */ }
    URL.revokeObjectURL(url)
  }

  iframe.onload = () => {
    // 300 ms delay: Chrome's PDF viewer plugin initialises asynchronously after
    // the iframe's load event fires; calling print() too early hits the blank
    // HTML wrapper instead of the rendered PDF.
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } catch {
        // print() was blocked or failed — open PDF in new tab as real fallback
        window.open(url, '_blank')
        cleanup()
        return
      }

      // afterprint fires when the user closes the print dialog in Chrome/Firefox
      const win = iframe.contentWindow
      if (win) {
        win.addEventListener('afterprint', cleanup, { once: true })
      }
      // Safety net: release resources after 5 min even if afterprint never fires
      setTimeout(cleanup, 5 * 60 * 1000)
    }, 300)
  }

  // No onerror → window.open mapping here. Chrome sometimes dispatches an error
  // event for the PDF plugin even on a successful load; an unconditional
  // window.open in onerror was the reason an extra tab always opened.

  document.body.appendChild(iframe)
  iframe.src = url
}

export function useGenerarDocumento() {
  const [generating, setGenerating] = useState<Generating>(null)
  const [bulkGenerating, setBulkGenerating] = useState<DocTipo | null>(null)
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

  /**
   * Genera un único PDF con los documentos de varios pedidos (un click) y abre
   * el diálogo de impresión. El backend combina todos los PDFs en uno solo.
   */
  async function generarDocumentosBulk(ids: string[], tipo: DocTipo) {
    if (bulkGenerating || generating) return
    if (ids.length === 0) return
    setBulkGenerating(tipo)
    try {
      const res = await fetch('/api/pedidos/documentos-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, ids }),
      })

      if (!res.ok) {
        let errMsg = 'Error al generar los documentos'
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
      toast.error('Error de conexión al generar los documentos')
    } finally {
      setBulkGenerating(null)
    }
  }

  function isGenerating(pedidoId: string, tipo: DocTipo): boolean {
    return generating?.pedidoId === pedidoId && generating.tipo === tipo
  }

  function anyGenerating(pedidoId: string): boolean {
    return generating?.pedidoId === pedidoId
  }

  function isBulkGenerating(tipo?: DocTipo): boolean {
    return tipo ? bulkGenerating === tipo : bulkGenerating !== null
  }

  return {
    generarDocumento,
    generarDocumentosBulk,
    isGenerating,
    anyGenerating,
    isBulkGenerating,
  }
}
