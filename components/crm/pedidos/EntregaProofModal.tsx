'use client'

import { useState, useRef } from 'react'
import { Camera, MapPin, PenLine, X, CheckCircle, Loader2 } from 'lucide-react'
import SignaturePad from '@/components/shared/SignaturePad'

type Props = {
  onConfirm: () => void
  onClose: () => void
  isLoading: boolean
}

export default function EntregaProofModal({ onConfirm, onClose, isLoading }: Props) {
  const [photo, setPhoto] = useState<string | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locLoading, setLocLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(reader.result as string)
    reader.readAsDataURL(file)
  }

  function captureLocation() {
    setLocLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocLoading(false)
      },
      () => setLocLoading(false),
      { enableHighAccuracy: true, timeout: 8_000 },
    )
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-end md:items-center justify-center">
      <div className="bg-background w-full md:max-w-md md:rounded-xl rounded-t-2xl max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold">Confirmar entrega</h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Photo */}
          <section>
            <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <Camera size={15} className="text-muted-foreground" />
              Foto de entrega
              <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhoto}
            />
            {photo ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo}
                  alt="Foto entrega"
                  className="w-full h-44 object-cover rounded-xl"
                />
                <button
                  onClick={() => setPhoto(null)}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full h-28 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary active:bg-accent/40 transition-colors"
              >
                <Camera size={26} />
                <span className="text-xs">Tomar foto</span>
              </button>
            )}
          </section>

          {/* Signature */}
          <section>
            <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <PenLine size={15} className="text-muted-foreground" />
              Firma del receptor
              <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
            </p>
            {signature ? (
              <div className="relative border border-border rounded-xl overflow-hidden bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signature} alt="Firma" className="w-full h-24 object-contain" />
                <button
                  onClick={() => setSignature(null)}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <SignaturePad onSave={setSignature} />
            )}
          </section>

          {/* Location */}
          <section>
            <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <MapPin size={15} className="text-muted-foreground" />
              Ubicación
            </p>
            {location ? (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-xs text-green-700 dark:text-green-300">
                <MapPin size={13} />
                {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                <button onClick={() => setLocation(null)} className="ml-auto text-green-500 hover:text-green-700">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <button
                onClick={captureLocation}
                disabled={locLoading}
                className="flex items-center gap-2 px-3 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:bg-accent active:bg-accent/60 transition-colors disabled:opacity-50 w-full"
              >
                {locLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <MapPin size={14} />
                )}
                Capturar ubicación actual
              </button>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-border shrink-0">
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity active:scale-[0.98] text-[16px]"
          >
            {isLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <CheckCircle size={18} />
            )}
            Confirmar entrega
          </button>
        </div>
      </div>
    </div>
  )
}
