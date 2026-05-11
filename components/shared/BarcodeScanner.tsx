'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ZapOff } from 'lucide-react'

type Props = {
  onScan: (code: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(true)
  const controlsRef = useRef<{ stop: () => void } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()

        if (!videoRef.current) return

        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result, err) => {
            if (cancelled) return
            if (result) {
              setScanning(false)
              controls.stop()
              onScan(result.getText())
              onClose()
            }
            if (err && err.name !== 'NotFoundException') {
              setError('Error al leer el código')
            }
          },
        )

        controlsRef.current = controls
      } catch {
        if (!cancelled) setError('No se pudo acceder a la cámara')
      }
    }

    void init()

    return () => {
      cancelled = true
      controlsRef.current?.stop()
    }
  }, [onScan, onClose])

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/40">
        <span className="text-white text-sm font-medium">Escanear código de barras</span>
        <button onClick={onClose} className="text-white p-1.5 -mr-1.5">
          <X size={22} />
        </button>
      </div>

      {/* Camera / error */}
      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8">
          <ZapOff size={32} className="text-white/40" />
          <p className="text-white/70 text-sm text-center">{error}</p>
          <button
            onClick={onClose}
            className="mt-4 px-6 py-2.5 bg-white/10 text-white rounded-full text-sm"
          >
            Cerrar
          </button>
        </div>
      ) : (
        <div className="flex-1 relative overflow-hidden">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
          />
          {/* Scan frame overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-72 h-56">
              {/* Dimmed corners */}
              <div className="absolute inset-0 border border-white/20 rounded-lg" />
              {/* Corner brackets */}
              <span className="absolute top-0 left-0 w-7 h-7 border-t-3 border-l-3 border-primary rounded-tl-lg" style={{ borderWidth: '3px' }} />
              <span className="absolute top-0 right-0 w-7 h-7 border-t-3 border-r-3 border-primary rounded-tr-lg" style={{ borderWidth: '3px' }} />
              <span className="absolute bottom-0 left-0 w-7 h-7 border-b-3 border-l-3 border-primary rounded-bl-lg" style={{ borderWidth: '3px' }} />
              <span className="absolute bottom-0 right-0 w-7 h-7 border-b-3 border-r-3 border-primary rounded-br-lg" style={{ borderWidth: '3px' }} />
              {/* Scan line animation */}
              {scanning && (
                <div className="absolute inset-x-0 h-0.5 bg-primary/80 animate-scan" style={{ top: '50%' }} />
              )}
            </div>
          </div>
          <p className="absolute bottom-10 left-0 right-0 text-center text-white/60 text-xs">
            Apuntá la cámara al código de barras
          </p>
        </div>
      )}
    </div>
  )
}
