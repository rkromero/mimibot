// OpenRouteService geocoding client.
// Free API key — no credit card needed — at https://openrouteservice.org

const ORS_GEOCODE_URL = 'https://api.openrouteservice.org/geocode/search'
const ORS_GEOCODE_STRUCTURED_URL = 'https://api.openrouteservice.org/geocode/search/structured'

export function getOrsKey(): string {
  const key = process.env['ORS_API_KEY']
  if (!key) {
    throw new Error(
      'ORS_API_KEY no está configurada. Obtené una clave gratuita en https://openrouteservice.org (sin tarjeta de crédito).',
    )
  }
  return key
}

type OrsFeature = {
  geometry: { coordinates: [number, number] }
}

type OrsResponse = {
  features?: OrsFeature[]
}

export async function geocodeAddress(text: string): Promise<{ lat: number; lng: number } | null> {
  const key = getOrsKey()
  const url = new URL(ORS_GEOCODE_URL)
  url.searchParams.set('api_key', key)
  url.searchParams.set('text', text)
  url.searchParams.set('boundary.country', 'AR')
  url.searchParams.set('size', '1')

  const res = await fetch(url.toString())
  if (!res.ok) {
    console.error(`[geocode] ORS error ${res.status} para "${text}"`)
    return null
  }

  const json = await res.json() as OrsResponse
  const coords = json.features?.[0]?.geometry?.coordinates
  if (!coords) return null

  // ORS returns [lng, lat]
  return { lat: coords[1], lng: coords[0] }
}

export async function geocodeStructured({
  address,
  locality,
  region,
  country = 'AR',
}: {
  address: string
  locality?: string | null
  region?: string | null
  country?: string
}): Promise<{ lat: number; lng: number } | null> {
  const key = getOrsKey()
  const url = new URL(ORS_GEOCODE_STRUCTURED_URL)
  url.searchParams.set('api_key', key)
  url.searchParams.set('address', address)
  if (locality) url.searchParams.set('locality', locality)
  if (region) url.searchParams.set('region', region)
  url.searchParams.set('country', country)
  url.searchParams.set('size', '1')

  const res = await fetch(url.toString())
  if (!res.ok) {
    console.error(`[geocode] ORS structured error ${res.status} para "${address}"`)
  } else {
    const json = await res.json() as OrsResponse
    const coords = json.features?.[0]?.geometry?.coordinates
    if (coords) {
      // ORS returns [lng, lat]
      return { lat: coords[1], lng: coords[0] }
    }
  }

  // Fallback to free-text search with full address string
  const fullText = [address, locality, region].filter(Boolean).join(', ')
  return geocodeAddress(fullText)
}
