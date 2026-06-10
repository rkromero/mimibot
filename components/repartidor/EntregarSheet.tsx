'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  CheckCircle, Loader2, AlertCircle, X, QrCode, Banknote, Clock, ChevronLeft, Camera, ImagePlus,
} from 'lucide-react'
import BottomSheet from '@/components/shared/BottomSheet'
import SignaturePad from '@/components/shared/SignaturePad'
import { useToast } from '@/components/shared/ToastProvider'

type Step = 'firma' | 'metodo' | 'efectivo' | 'a_cuenta' | 'qr' | 'paid' | 'partial' | 'foto_remito'
type GpsCoords = { lat: number; lng: number; precisionM: number }

type Props = {
  pedidoId: string
  clienteNombre: string
  saldoPendiente: string
  metodoEntrega?: string | null
  open: boolean
  onClose: () => void
  onDelivered: () => void
}

const TITLES: Record<Step, string> = {
  firma: 'Firma del receptor',
  metodo: '¿Cómo cobrás?',
  efectivo: 'Cobro en efectivo',
  a_cuenta: 'Entregar sin cobrar',
  qr: 'Cobrar con QR',
  paid: '¡Entrega confirmada!',
  partial: 'Entrega confirmada',
  foto_remito: 'Foto del remito firmado',
}

function formatMoney(v: string | number) {
  return `$${parseFloat(String(v)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
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

function startGps(): Promise<GpsCoords | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, precisionM: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  })
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
      <AlertCircle size={16} className="shrink-0 mt-0.5" />
      <p className="text-sm flex-1">{msg}</p>
    </div>
  )
}

function BackBtn({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 -ml-1"
    >
      <ChevronLeft size={16} />
      Volver
    </button>
  )
}

export default function EntregarSheet({
  pedidoId, clienteNombre, saldoPendiente, metodoEntrega, open, onClose, onDelivered,
}: Props) {
  const toast = useToast()
  const isExpreso = metodoEntrega === 'expreso'
  const [step, setStep] = useState<Step>(isExpreso ? 'foto_remito' : 'firma')
  const [signature, setSignature] = useState<string | null>(null)
  const [firmaUrl, setFirmaUrl] = useState<string | null>(null)
  const gpsRef = useRef<Promise<GpsCoords | null>>(Promise.resolve(null))
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [montoStr, setMontoStr] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [partialSaldo, setPartialSaldo] = useState<string | null>(null)
  // Expreso: foto del remito
  const fotoInputRef = useRef<HTMLInputElement | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [fotoFile, setFotoFile] = useState<File | null>(null)

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  // Reset when sheet closes
  useEffect(() => {
    if (!open) {
      stopPolling()
      setStep(isExpreso ? 'foto_remito' : 'firma')
      setSignature(null)
      setFirmaUrl(null)
      gpsRef.current = Promise.resolve(null)
      setLoading(false)
      setErrorMsg(null)
      setMontoStr('')
      setQrDataUrl(null)
      setPartialSaldo(null)
      setFotoPreview(null)
      setFotoFile(null)
    }
    return () => stopPolling()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Start GPS in background as soon as sheet opens
  useEffect(() => {
    if (open) gpsRef.current = startGps()
  }, [open])

  // ── Expreso: foto remito ──────────────────────────────────────────────────────

  const handleFotoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFotoFile(file)
    setFotoPreview(URL.createObjectURL(file))
    setErrorMsg(null)
  }, [])

  async function handleEntregarExpreso() {
    if (!fotoFile) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', fotoFile, fotoFile.name)
      const uploadRes = await fetch('/api/repartidor/upload-firma', { method: 'POST', body: fd })
      if (!uploadRes.ok) {
        const json = await uploadRes.json().catch(() => ({})) as { error?: string }
        throw new Error(json.error ?? 'Error al subir la foto del remito')
      }
      const { r2Key } = await uploadRes.json() as { r2Key: string }

      const gps = await gpsRef.current
      const body: Record<string, unknown> = { remitoFotoUrl: r2Key }
      if (gps) { body.lat = gps.lat; body.lng = gps.lng; body.precisionM = gps.precisionM }

      const res = await fetch(`/api/repartidor/pedidos/${pedidoId}/entregar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(json.error ?? 'Error al confirmar entrega')
      }
      setStep('paid')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 1: firma ────────────────────────────────────────────────────────────

  async function handleFirmaNext() {
    if (!signature) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const url = await uploadFirma(signature)
      setFirmaUrl(url)
      setStep('metodo')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al subir la firma')
    } finally {
      setLoading(false)
    }
  }

  // ── Shared helper ────────────────────────────────────────────────────────────

  async function callEntregar(fUrl: string, settlement: Record<string, unknown>, gps: GpsCoords | null) {
    const body: Record<string, unknown> = { firmaUrl: fUrl, settlement }
    if (gps) { body.lat = gps.lat; body.lng = gps.lng; body.precisionM = gps.precisionM }
    const res = await fetch(`/api/repartidor/pedidos/${pedidoId}/entregar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(json.error ?? 'Error al confirmar entrega')
    }
  }

  // ── Step 3a: efectivo ────────────────────────────────────────────────────────

  async function handleEfectivo() {
    if (!firmaUrl) return
    const monto = parseFloat(montoStr.replace(',', '.'))
    const saldo = parseFloat(saldoPendiente)
    if (isNaN(monto) || monto <= 0) { setErrorMsg('Ingresá un monto válido mayor a 0'); return }
    if (monto > saldo + 0.001) {
      setErrorMsg(`El monto no puede superar el saldo pendiente (${formatMoney(saldoPendiente)})`)
      return
    }
    setLoading(true)
    setErrorMsg(null)
    try {
      const gps = await gpsRef.current
      await callEntregar(firmaUrl, { tipo: 'efectivo', monto }, gps)
      if (monto < saldo - 0.001) {
        setPartialSaldo((saldo - monto).toFixed(2))
        setStep('partial')
      } else {
        setStep('paid')
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3b: a cuenta ────────────────────────────────────────────────────────

  async function handleACuenta() {
    if (!firmaUrl) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const gps = await gpsRef.current
      await callEntregar(firmaUrl, { tipo: 'a_cuenta' }, gps)
      setStep('paid')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3c: QR ──────────────────────────────────────────────────────────────

  async function handleQr() {
    if (!firmaUrl) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const gps = await gpsRef.current
      const body: Record<string, unknown> = { firmaUrl }
      if (gps) { body.lat = gps.lat; body.lng = gps.lng; body.precisionM = gps.precisionM }
      const res = await fetch(`/api/repartidor/pedidos/${pedidoId}/cobro-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(json.error ?? 'Error al generar el QR')
      }
      const { initPoint } = await res.json() as { initPoint: string }
      const QRCode = (await import('qrcode')).default
      const dataUrl = await QRCode.toDataURL(initPoint, {
        width: 280, margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      })
      setQrDataUrl(dataUrl)
      setStep('qr')
      pollingRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/repartidor/pedidos/${pedidoId}/estado-pago`)
          if (!r.ok) return
          const data = await r.json() as { estadoPago: string; saldoPendiente: string }
          if (data.estadoPago === 'pagado' || parseFloat(data.saldoPendiente) <= 0) {
            stopPolling()
            setStep('paid')
          }
        } catch { /* keep polling */ }
      }, 4000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  function handleQrCancel() {
    stopPolling()
    toast.warning('El pedido sigue en reparto. Podés usar otro método cuando sea necesario.')
    onClose()
  }

  function handleFinish() {
    onDelivered()
    onClose()
  }

  function handleClose() {
    if (loading) return
    if (step === 'qr') { handleQrCancel(); return }
    if (step === 'paid' || step === 'partial') { handleFinish(); return }
    onClose()
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const saldo = parseFloat(saldoPendiente)
  const montoNum = parseFloat(montoStr.replace(',', '.'))
  const montoValido = !isNaN(montoNum) && montoNum > 0 && montoNum <= saldo + 0.001

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <BottomSheet open={open} onClose={handleClose} title={TITLES[step]}>
      <div className="space-y-4 pb-2">

        {/* ── FIRMA ── */}
        {step === 'firma' && (
          <>
            <p className="text-sm text-muted-foreground">
              Pedile a <span className="font-medium text-foreground">{clienteNombre}</span> que firme con el dedo:
            </p>

            {signature ? (
              <div className="relative rounded-xl overflow-hidden border-2 border-primary/30 bg-white dark:bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signature} alt="Firma capturada" className="w-full h-36 object-contain" />
                <button
                  type="button"
                  onClick={() => setSignature(null)}
                  disabled={loading}
                  aria-label="Borrar firma"
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <SignaturePad onSave={setSignature} className="w-full" />
            )}

            {errorMsg && <ErrorBox msg={errorMsg} />}

            <button
              type="button"
              onClick={() => void handleFirmaNext()}
              disabled={!signature || loading}
              className="w-full min-h-[52px] bg-primary text-primary-foreground rounded-xl font-semibold flex items-center justify-center gap-2.5 text-base disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {loading
                ? <><Loader2 size={20} className="animate-spin" /> Procesando...</>
                : <><CheckCircle size={20} /> Siguiente</>
              }
            </button>
          </>
        )}

        {/* ── MÉTODO ── */}
        {step === 'metodo' && (
          <>
            <p className="text-sm text-muted-foreground text-center">
              Saldo pendiente:{' '}
              <span className="font-bold text-foreground text-base">{formatMoney(saldoPendiente)}</span>
            </p>

            <div className="space-y-2.5">
              {/* Efectivo */}
              <button
                type="button"
                onClick={() => { setErrorMsg(null); setMontoStr(saldoPendiente); setStep('efectivo') }}
                disabled={loading}
                className="w-full min-h-[60px] rounded-xl border-2 border-border hover:border-primary/40 bg-card hover:bg-accent active:bg-accent/60 transition-all flex items-center gap-4 px-4 disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <Banknote size={20} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-foreground">Efectivo</p>
                  <p className="text-xs text-muted-foreground">Total o parcial</p>
                </div>
              </button>

              {/* QR Mercado Pago */}
              <button
                type="button"
                onClick={() => void handleQr()}
                disabled={loading}
                className="w-full min-h-[60px] rounded-xl border-2 border-border hover:border-primary/40 bg-card hover:bg-accent active:bg-accent/60 transition-all flex items-center gap-4 px-4 disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  {loading
                    ? <Loader2 size={20} className="animate-spin text-blue-600 dark:text-blue-400" />
                    : <QrCode size={20} className="text-blue-600 dark:text-blue-400" />
                  }
                </div>
                <div className="text-left">
                  <p className="font-semibold text-foreground">QR Mercado Pago</p>
                  <p className="text-xs text-muted-foreground">El cliente escanea y paga</p>
                </div>
              </button>

              {/* A cuenta */}
              <button
                type="button"
                onClick={() => { setErrorMsg(null); setStep('a_cuenta') }}
                disabled={loading}
                className="w-full min-h-[60px] rounded-xl border-2 border-border hover:border-primary/40 bg-card hover:bg-accent active:bg-accent/60 transition-all flex items-center gap-4 px-4 disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                  <Clock size={20} className="text-zinc-600 dark:text-zinc-400" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-foreground">A cuenta</p>
                  <p className="text-xs text-muted-foreground">Entregar sin cobrar, saldo en CC</p>
                </div>
              </button>
            </div>

            {errorMsg && <ErrorBox msg={errorMsg} />}
          </>
        )}

        {/* ── EFECTIVO ── */}
        {step === 'efectivo' && (
          <>
            <BackBtn onClick={() => { setErrorMsg(null); setStep('metodo') }} disabled={loading} />

            <p className="text-sm text-muted-foreground">
              Saldo pendiente:{' '}
              <span className="font-semibold text-foreground">{formatMoney(saldoPendiente)}</span>
            </p>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="monto-efectivo">
                Monto cobrado ($)
              </label>
              <input
                id="monto-efectivo"
                type="number"
                inputMode="decimal"
                min="0.01"
                max={saldo}
                step="0.01"
                value={montoStr}
                onChange={(e) => { setMontoStr(e.target.value); setErrorMsg(null) }}
                className="w-full min-h-[52px] rounded-xl border border-border bg-background px-4 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
              />
              {!isNaN(montoNum) && montoNum > 0 && montoNum < saldo - 0.001 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Pago parcial — quedará {formatMoney((saldo - montoNum).toFixed(2))} pendiente
                </p>
              )}
            </div>

            {errorMsg && <ErrorBox msg={errorMsg} />}

            <button
              type="button"
              onClick={() => void handleEfectivo()}
              disabled={!montoValido || loading}
              className="w-full min-h-[52px] bg-primary text-primary-foreground rounded-xl font-semibold flex items-center justify-center gap-2.5 text-base disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {loading
                ? <><Loader2 size={20} className="animate-spin" /> Confirmando...</>
                : <><CheckCircle size={20} /> Confirmar entrega</>
              }
            </button>
          </>
        )}

        {/* ── A CUENTA ── */}
        {step === 'a_cuenta' && (
          <>
            <BackBtn onClick={() => { setErrorMsg(null); setStep('metodo') }} disabled={loading} />

            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 space-y-1">
              <p className="font-semibold text-amber-800 dark:text-amber-200">Entregar sin cobrar</p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                El pedido quedará entregado y el saldo de{' '}
                <span className="font-bold">{formatMoney(saldoPendiente)}</span>{' '}
                se registrará en la cuenta corriente del cliente.
              </p>
            </div>

            {errorMsg && <ErrorBox msg={errorMsg} />}

            <button
              type="button"
              onClick={() => void handleACuenta()}
              disabled={loading}
              className="w-full min-h-[52px] bg-primary text-primary-foreground rounded-xl font-semibold flex items-center justify-center gap-2.5 text-base disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {loading
                ? <><Loader2 size={20} className="animate-spin" /> Confirmando...</>
                : <><CheckCircle size={20} /> Confirmar entrega a cuenta</>
              }
            </button>
          </>
        )}

        {/* ── QR ── */}
        {step === 'qr' && qrDataUrl && (
          <div className="flex flex-col items-center gap-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Monto a cobrar</p>
              <p className="text-3xl font-bold text-foreground">{formatMoney(saldoPendiente)}</p>
            </div>

            <div className="bg-white p-3 rounded-2xl shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="QR Mercado Pago" width={240} height={240} className="block" />
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
              onClick={handleQrCancel}
              className="w-full min-h-[52px] border border-border rounded-xl font-medium text-muted-foreground hover:bg-accent active:bg-accent/60 transition-colors text-sm flex items-center justify-center gap-2"
            >
              <X size={15} />
              Cancelar — el pedido sigue en reparto
            </button>
          </div>
        )}

        {/* ── PAGO RECIBIDO ── */}
        {step === 'paid' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle size={44} className="text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-xl font-bold text-foreground">¡Entrega confirmada!</p>
              <p className="text-sm text-muted-foreground">{clienteNombre}</p>
            </div>
            <button
              type="button"
              onClick={handleFinish}
              className="w-full min-h-[56px] bg-green-600 text-white rounded-xl font-semibold text-base active:scale-[0.98] transition-all hover:bg-green-700"
            >
              Continuar
            </button>
          </div>
        )}

        {/* ── FOTO REMITO (expreso) ── */}
        {step === 'foto_remito' && (
          <>
            <p className="text-sm text-muted-foreground">
              Sacá una foto del remito firmado por{' '}
              <span className="font-medium text-foreground">{clienteNombre}</span>:
            </p>

            {/* Preview or capture button */}
            {fotoPreview ? (
              <div className="relative rounded-xl overflow-hidden border-2 border-primary/30 bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fotoPreview}
                  alt="Vista previa del remito"
                  className="w-full max-h-64 object-contain"
                />
                <button
                  type="button"
                  onClick={() => { setFotoPreview(null); setFotoFile(null) }}
                  disabled={loading}
                  aria-label="Sacar otra foto"
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fotoInputRef.current?.click()}
                disabled={loading}
                className="w-full min-h-[120px] rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 hover:bg-muted/50 active:bg-muted/70 transition-all flex flex-col items-center justify-center gap-2 text-muted-foreground disabled:opacity-50"
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Camera size={24} className="text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-sm font-medium">Tomar foto del remito</span>
                <span className="text-xs flex items-center gap-1">
                  <ImagePlus size={12} />
                  O elegir desde la galería
                </span>
              </button>
            )}

            {/* Hidden file input — opens camera on mobile */}
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={handleFotoChange}
            />

            {errorMsg && <ErrorBox msg={errorMsg} />}

            <button
              type="button"
              onClick={() => void handleEntregarExpreso()}
              disabled={!fotoFile || loading}
              className="w-full min-h-[52px] bg-blue-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2.5 text-base disabled:opacity-50 active:scale-[0.98] transition-all hover:bg-blue-700"
            >
              {loading
                ? <><Loader2 size={20} className="animate-spin" /> Subiendo y confirmando...</>
                : <><CheckCircle size={20} /> Confirmar entrega</>
              }
            </button>

            {!fotoFile && (
              <p className="text-xs text-center text-muted-foreground">
                La foto del remito firmado es requerida para confirmar la entrega
              </p>
            )}
          </>
        )}

        {/* ── PAGO PARCIAL ── */}
        {step === 'partial' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <CheckCircle size={44} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-xl font-bold text-foreground">Entrega confirmada</p>
              <p className="text-sm text-muted-foreground">Pago parcial registrado</p>
              {partialSaldo && (
                <div className="px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    Saldo restante: {formatMoney(partialSaldo)}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                    Queda pendiente en la cuenta corriente del cliente
                  </p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleFinish}
              className="w-full min-h-[56px] bg-amber-600 text-white rounded-xl font-semibold text-base active:scale-[0.98] transition-all hover:bg-amber-700"
            >
              Continuar
            </button>
          </div>
        )}

      </div>
    </BottomSheet>
  )
}
