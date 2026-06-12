// Helpers puros para la UI de ruta del repartidor: construcción de la URL de
// Google Maps y obtención de la ubicación del dispositivo. Se extraen del
// componente para poder testearlos sin infraestructura de testing de componentes.

export type Ubicacion = { lat: number; lng: number }

/** Error tipado para distinguir el rechazo de permiso de otros fallos de geolocalización. */
export class GeolocationDeniedError extends Error {
  constructor(message = 'Permiso de ubicación denegado') {
    super(message)
    this.name = 'GeolocationDeniedError'
  }
}

/**
 * Pide la ubicación actual con alta precisión y timeout de 10s.
 * Rechaza con GeolocationDeniedError si el usuario niega el permiso o si la
 * geolocalización no está disponible; con Error genérico ante otros fallos.
 */
export function obtenerUbicacion(): Promise<Ubicacion> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeolocationDeniedError('La geolocalización no está disponible en este dispositivo'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        // err.code === 1 → PERMISSION_DENIED
        if (err && err.code === 1) {
          reject(new GeolocationDeniedError())
        } else {
          reject(new Error(err?.message || 'No se pudo obtener la ubicación'))
        }
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  })
}

export type ClienteUbicacion = {
  lat?: number | null
  lng?: number | null
  direccion?: string | null
  localidad?: string | null
  provincia?: string | null
  nombre: string
  apellido: string
}

const MAPS_DIR_BASE = 'https://www.google.com/maps/dir/?api=1&destination='

/**
 * URL de navegación de Google Maps hacia la parada.
 * Prefiere coordenadas exactas (lat,lng); si no las hay, usa la dirección
 * urlencodeada y, como último recurso, el nombre del cliente.
 */
export function construirMapsUrl(cliente: ClienteUbicacion): string {
  if (cliente.lat != null && cliente.lng != null) {
    return `${MAPS_DIR_BASE}${cliente.lat},${cliente.lng}`
  }
  const parts = [cliente.direccion, cliente.localidad, cliente.provincia].filter(Boolean)
  const destino = parts.length > 0 ? parts.join(', ') : `${cliente.nombre} ${cliente.apellido}`
  return `${MAPS_DIR_BASE}${encodeURIComponent(destino)}`
}
