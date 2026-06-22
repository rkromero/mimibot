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

// Pelias (motor de ORS) no reconoce abreviaturas de provincia argentinas como
// "CABA". Si se las pasa en `region`, no matchea y devuelve un resultado grueso
// a nivel país (centroide de Argentina ≈ -34, -64, en el centro del país),
// haciendo que el GPS y el optimizador de ruta apunten lejísimos del destino real.
// Normalizamos las variantes conocidas al nombre canónico de Who's on First.
const REGION_ALIASES: Record<string, string> = {
  caba: 'Ciudad Autónoma de Buenos Aires',
  'c.a.b.a': 'Ciudad Autónoma de Buenos Aires',
  'c.a.b.a.': 'Ciudad Autónoma de Buenos Aires',
  'capital federal': 'Ciudad Autónoma de Buenos Aires',
  'ciudad de buenos aires': 'Ciudad Autónoma de Buenos Aires',
  'ciudad autonoma de buenos aires': 'Ciudad Autónoma de Buenos Aires',
}

export function normalizeRegion(region?: string | null): string | null {
  if (!region) return null
  const trimmed = region.trim()
  if (!trimmed) return null
  return REGION_ALIASES[trimmed.toLowerCase()] ?? trimmed
}

// Capas de Pelias demasiado gruesas para una parada de reparto: aceptarlas
// significaría guardar un centroide de provincia/país en vez de la dirección.
const COARSE_LAYERS = new Set([
  'country',
  'dependency',
  'macroregion',
  'region',
  'macrocounty',
  'county',
])
// Confianza mínima para aceptar un resultado (Pelias devuelve 0..1).
const MIN_CONFIDENCE = 0.3

type OrsFeatureProperties = {
  layer?: string
  confidence?: number
  match_type?: string
  label?: string
}

type OrsFeature = {
  geometry: { coordinates: [number, number] }
  properties?: OrsFeatureProperties
}

type OrsResponse = {
  features?: OrsFeature[]
}

/**
 * Elige la primera feature lo bastante precisa como para ser una dirección real.
 * Descarta resultados gruesos (país/provincia) y de baja confianza, que es lo
 * que Pelias devuelve como fallback cuando no logra resolver el domicilio.
 * Devuelve null si ninguna feature es aceptable.
 */
function pickPreciseCoords(features: OrsFeature[] | undefined): { lat: number; lng: number } | null {
  for (const f of features ?? []) {
    const layer = f.properties?.layer
    const confidence = f.properties?.confidence
    const matchType = f.properties?.match_type
    if (layer && COARSE_LAYERS.has(layer)) continue
    if (matchType === 'fallback') continue
    if (typeof confidence === 'number' && confidence < MIN_CONFIDENCE) continue
    const coords = f.geometry?.coordinates
    if (!coords) continue
    // ORS returns [lng, lat]
    return { lat: coords[1], lng: coords[0] }
  }
  return null
}

export async function geocodeAddress(text: string): Promise<{ lat: number; lng: number } | null> {
  const key = getOrsKey()
  const url = new URL(ORS_GEOCODE_URL)
  url.searchParams.set('api_key', key)
  url.searchParams.set('text', text)
  url.searchParams.set('boundary.country', 'AR')
  url.searchParams.set('size', '3')

  const res = await fetch(url.toString())
  if (!res.ok) {
    console.error(`[geocode] ORS error ${res.status} para "${text}"`)
    return null
  }

  const json = await res.json() as OrsResponse
  const coords = pickPreciseCoords(json.features)
  if (!coords) {
    console.warn(`[geocode] sin resultado preciso (free-text) para "${text}"`)
  }
  return coords
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
  const normalizedRegion = normalizeRegion(region)
  const url = new URL(ORS_GEOCODE_STRUCTURED_URL)
  url.searchParams.set('api_key', key)
  url.searchParams.set('address', address)
  if (locality) url.searchParams.set('locality', locality)
  if (normalizedRegion) url.searchParams.set('region', normalizedRegion)
  url.searchParams.set('country', country)
  url.searchParams.set('size', '3')

  const res = await fetch(url.toString())
  if (!res.ok) {
    console.error(`[geocode] ORS structured error ${res.status} para "${address}"`)
  } else {
    const json = await res.json() as OrsResponse
    const coords = pickPreciseCoords(json.features)
    if (coords) return coords
    console.warn(`[geocode] structured sin resultado preciso para "${address}", probando free-text`)
  }

  // Fallback to free-text search with full address string (region ya normalizada).
  const fullText = [address, locality, normalizedRegion].filter(Boolean).join(', ')
  return geocodeAddress(fullText)
}
