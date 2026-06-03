'use client'

import { useState, useEffect, useRef } from 'react'
import { CheckCircle, Loader2, AlertCircle, X, QrCode } from 'lucide-react'
import BottomSheet from '@/components/shared/BottomSheet'

type Props = {
  pedidoId: string
  clienteNombre: string
  saldoPendiente: string
  open: boolean
  onClose: () => void
}

type Estado = 'choice' | 'loading' | 'qr' | 'paid' | 'error'

function formatMoney(v: string | number) {
  return `$${parseFloat(String(v)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

export default function CobroQrSheet({
  pedidoId,
  clienteNombre,
  saldoPendiente,
  open,
  onClose,
}: Props) {
  const [estado, setEstado] = useState<Estado>('choice')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  // Cleanup on unmount or close
  useEffect(() => {
    if (!open) {
      stopPolling()
      // Reset state when closed
      setEstado('choice')
      setQrDataUrl(null)
      setErrorMsg(null)
    }
    return () => stopPolling()
  }, [open])

  async function generarQr() {
    setEstado('loading')
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/repartidor/pedidos/${pedidoId}/cobro-qr`, {
        method: 'POST',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(json.error ?? 'Error al generar el QR')
      }
      const { initPoint } = await res.json() as { initPoint: string }

      // Generate QR from initPoint URL
      const QRCode = (await import('qrcode')).default
      const dataUrl = await QRCode.toDataURL(initPoint, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      })
      setQrDataUrl(dataUrl)
      setEstado('qr')

      // Start polling for payment confirmation
      pollingRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/repartidor/pedidos/${pedidoId}/estado-pago`)
          if (!r.ok) return
          const data = await r.json() as { estadoPago: string; saldoPendiente: string }
          if (data.estadoPago === 'pagado' || parseFloat(data.saldoPendiente) <= 0) {
            stopPolling()
            setEstado('paid')
          }
        } catch {
          // Network error — keep polling
        }
      }, 4000)
    } catch (err) {
      setEstado('error')
      setErrorMsg(err instanceof Error ? err.message : 'Error inesperado')
    }
  }

  function handleClose() {
    stopPolling()
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title="Cobrar con QR">
      <div className="space-y-5 pb-2">

        {/* CHOICE */}
        {estado === 'choice' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              Pedido de <span className="font-medium text-foreground">{clienteNombre}</span>
            </p>
            <p className="text-center text-3xl font-bold text-foreground">
              {formatMoney(saldoPendiente)}
            </p>
            <button
              type="button"
              onClick={() => void generarQr()}
              className="w-full min-h-[56px] bg-primary text-primary-foreground rounded-xl font-semibold flex items-center justify-center gap-2.5 text-base active:scale-[0.98] transition-all hover:bg-primary/90"
            >
              <QrCode size={20} />
              Generar QR de MercadoPago
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="w-full min-h-[52px] border border-border rounded-xl font-medium text-muted-foreground hover:bg-accent active:bg-accent/60 transition-colors text-sm"
            >
              Cobrar en efectivo / otro método
            </button>
          </div>
        )}

        {/* LOADING */}
        {estado === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <Loader2 size={36} className="animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Generando QR...</p>
          </div>
        )}

        {/* QR VISIBLE — ESPERANDO PAGO */}
        {estado === 'qr' && qrDataUrl && (
          <div className="flex flex-col items-center gap-4">
            <div>
              <p className="text-sm text-muted-foreground text-center">Monto a cobrar</p>
              <p className="text-3xl font-bold text-foreground text-center">
                {formatMoney(saldoPendiente)}
              </p>
            </div>

            {/* QR con fondo blanco y padding para fácil escaneo */}
            <div className="bg-white p-3 rounded-2xl shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="QR Mercado Pago"
                width={240}
                height={240}
                className="block"
              />
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin shrink-0" />
              <span>Esperando pago del cliente...</span>
            </div>

            <p className="text-xs text-muted-foreground text-center px-4">
              El cliente escanea con la app de MercadoPago
            </p>

            <button
              type="button"
              onClick={handleClose}
              className="w-full min-h-[52px] border border-border rounded-xl font-medium text-muted-foreground hover:bg-accent active:bg-accent/60 transition-colors text-sm flex items-center justify-center gap-2"
            >
              <X size={15} />
              Cancelar y usar otro método
            </button>
          </div>
        )}

        {/* PAGO RECIBIDO */}
        {estado === 'paid' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle size={44} className="text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-xl font-bold text-foreground">¡Pago recibido!</p>
              <p className="text-sm text-muted-foreground">
                {formatMoney(saldoPendiente)} cobrado por MercadoPago
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="w-full min-h-[56px] bg-green-600 text-white rounded-xl font-semibold text-base active:scale-[0.98] transition-all hover:bg-green-700"
            >
              Continuar
            </button>
          </div>
        )}

        {/* ERROR */}
        {estado === 'error' && (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 px-3 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <p className="text-sm flex-1">{errorMsg}</p>
            </div>
            <button
              type="button"
              onClick={() => void generarQr()}
              className="w-full min-h-[52px] bg-primary text-primary-foreground rounded-xl font-semibold active:scale-[0.98] transition-all"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="w-full min-h-[52px] border border-border rounded-xl font-medium text-muted-foreground hover:bg-accent transition-colors text-sm"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
