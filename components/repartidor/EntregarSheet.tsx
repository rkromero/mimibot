'use client'

import { useState } from 'react'
import { CheckCircle, Loader2, AlertCircle, X } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import BottomSheet from '@/components/shared/BottomSheet'
import SignaturePad from '@/components/shared/SignaturePad'
import { useToast } from '@/components/shared/ToastProvider'

type Props = {
  pedidoId: string
  clienteNombre: string
  open: boolean
  onClose: () => void
  onDelivered: () => void
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',') as [string, string]
  const mime = header.match(/:(.*?);/)![1]!
  const bstr = atob(data)
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) u8arr[n] = bstr.charCodeAt(n)
  return new Blob([u8arr], { type: mime })
}

async function uploadFirma(dataUrl: string): Promise<string> {
  const blob = dataUrlToBlob(dataUrl)
  const fd = new FormData()
  fd.append('file', blob, 'firma.png')
  const res = await fetch('/api/repartidor/upload-firma', { method: 'POST', body: fd })
  if (!res.ok) {
    const json = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(json.error ?? 'Error al subir la firma')
  }
  const { r2Key } = await res.json() as { r2Key: string }
  return r2Key
}

async function patchEntregar(pedidoId: string, firmaUrl: string): Promise<void> {
  const res = await fetch(`/api/repartidor/pedidos/${pedidoId}/entregar`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firmaUrl }),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(json.error ?? 'Error al confirmar entrega')
  }
}

export default function EntregarSheet({ pedidoId, clienteNombre, open, onClose, onDelivered }: Props) {
  const [signature, setSignature] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const toast = useToast()

  const mutation = useMutation({
    mutationFn: async () => {
      if (!signature) throw new Error('Capturá la firma primero')
      setErrorMsg(null)
      const r2Key = await uploadFirma(signature)
      await patchEntregar(pedidoId, r2Key)
    },
    onSuccess: () => {
      toast.success(`Entrega de ${clienteNombre} confirmada`)
      handleReset()
      onClose()
      onDelivered()
    },
    onError: (err) => {
      setErrorMsg(err instanceof Error ? err.message : 'Error inesperado')
    },
  })

  function handleReset() {
    setSignature(null)
    setErrorMsg(null)
    mutation.reset()
  }

  function handleClose() {
    if (mutation.isPending) return
    handleReset()
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title="Firma del receptor">
      <div className="space-y-4 pb-2">
        <p className="text-sm text-muted-foreground">
          Pedile al cliente que firme con el dedo en el recuadro:
        </p>

        {signature ? (
          <div className="relative rounded-xl overflow-hidden border-2 border-primary/30 bg-white dark:bg-zinc-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signature}
              alt="Firma capturada"
              className="w-full h-36 object-contain"
            />
            <button
              type="button"
              onClick={handleReset}
              disabled={mutation.isPending}
              aria-label="Borrar firma y volver a dibujar"
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors disabled:opacity-50"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <SignaturePad onSave={setSignature} className="w-full" />
        )}

        {errorMsg && (
          <div className="flex items-start gap-2.5 px-3 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <p className="text-sm flex-1">{errorMsg}</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={!signature || mutation.isPending}
          className="w-full min-h-[52px] bg-primary text-primary-foreground rounded-xl font-semibold flex items-center justify-center gap-2.5 text-base disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {mutation.isPending ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Confirmando...
            </>
          ) : errorMsg ? (
            <>
              <CheckCircle size={20} />
              Reintentar entrega
            </>
          ) : (
            <>
              <CheckCircle size={20} />
              Confirmar entrega
            </>
          )}
        </button>
      </div>
    </BottomSheet>
  )
}
