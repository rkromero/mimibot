'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPin, Navigation } from 'lucide-react'
import Link from 'next/link'

type Cliente = {
  id: string
  nombre: string
  apellido: string
  telefono?: string | null
}

type Props = {
  clientes: Cliente[]
}

export default function ClientesMap({ clientes }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mapRef = useRef<unknown>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Inject leaflet CSS once
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = '/leaflet/leaflet.css'
      // Fallback to CDN if local not available
      link.onerror = () => {
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      }
      document.head.appendChild(link)
    }

    const el = containerRef.current

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { lat, lng } = { lat: coords.latitude, lng: coords.longitude }

        const L = await import('leaflet')

        // Fix default icons for bundler environments
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (L.Icon.Default.prototype as any)._getIconUrl
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        })

        const map = L.map(el).setView([lat, lng], 14)
        mapRef.current = map

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map)

        // User position with pulse circle
        const pulseIcon = L.divIcon({
          className: '',
          html: `<div style="width:16px;height:16px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 0 4px rgba(59,130,246,0.3)"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        })

        L.marker([lat, lng], { icon: pulseIcon })
          .addTo(map)
          .bindPopup('<strong>Estás aquí</strong>')
          .openPopup()

        setLoading(false)
      },
      () => {
        setError('Activá la ubicación del dispositivo para ver el mapa')
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mapRef.current as any)?.remove()
    }
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Map */}
      <div className="relative" style={{ height: '55%' }}>
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-muted">
            <Loader2 size={22} className="animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Obteniendo ubicación...</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-muted px-8 text-center">
            <Navigation size={24} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* Client list */}
      <div className="flex-1 overflow-y-auto border-t border-border bg-background">
        <p className="text-xs font-medium text-muted-foreground px-4 pt-3 pb-1">
          {clientes.length} clientes
        </p>
        {clientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <MapPin size={20} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No hay clientes</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {clientes.map((c) => (
              <Link
                key={c.id}
                href={`/crm/clientes/${c.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 active:bg-accent/60 transition-colors"
              >
                <MapPin size={14} className="text-muted-foreground shrink-0" />
                <span className="font-medium text-sm flex-1">
                  {c.nombre} {c.apellido}
                </span>
                {c.telefono && (
                  <span className="text-xs text-muted-foreground">{c.telefono}</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
