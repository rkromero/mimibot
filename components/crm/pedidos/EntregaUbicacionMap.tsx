'use client'

import { useEffect, useRef } from 'react'

type Props = {
  lat: number
  lng: number
  precisionM?: number | null
}

export default function EntregaUbicacionMap({ lat, lng, precisionM }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<unknown>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current

    // Inject Leaflet CSS once (same pattern as ClientesMap)
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = '/leaflet/leaflet.css'
      link.onerror = () => {
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      }
      document.head.appendChild(link)
    }

    void (async () => {
      const L = await import('leaflet')

      // Fix default icon URLs for bundler environments (same as ClientesMap)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(el).setView([lat, lng], 16)
      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      L.marker([lat, lng])
        .addTo(map)
        .bindPopup('Firma de entrega')
        .openPopup()

      if (precisionM && precisionM > 0) {
        L.circle([lat, lng], {
          radius: precisionM,
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.08,
          weight: 1.5,
        }).addTo(map)
      }
    })()

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mapRef.current as any)?.remove()
      mapRef.current = null
    }
  }, [lat, lng, precisionM])

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden border border-border"
      style={{ height: '280px' }}
    />
  )
}
