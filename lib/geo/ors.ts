// OpenRouteService geocoding client.
// Free API key — no credit card needed — at https://openrouteservice.org

const ORS_GEOCODE_URL = 'https://api.openrouteservice.org/geocode/search'
const ORS_GEOCODE_STRUCTURED_URL = 'https://api.openrouteservice.org/geocode/search/structured'
const ORS_GEOCODE_REVERSE_URL = 'https://api.openrouteservice.org/geocode/reverse'

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
export const CABA_CANONICAL = 'Ciudad Autónoma de Buenos Aires'
const REGION_ALIASES: Record<string, string> = {
  caba: CABA_CANONICAL,
  'c.a.b.a': CABA_CANONICAL,
  'c.a.b.a.': CABA_CANONICAL,
  'capital federal': CABA_CANONICAL,
  'ciudad de buenos aires': CABA_CANONICAL,
  'ciudad autonoma de buenos aires': CABA_CANONICAL,
  'ciudad autónoma de buenos aires': CABA_CANONICAL,
}

export function normalizeRegion(region?: string | null): string | null {
  if (!region) return null
  const trimmed = region.trim()
  if (!trimmed) return null
  return REGION_ALIASES[trimmed.toLowerCase()] ?? trimmed
}

// Igual que normalizeRegion pero SOLO devuelve algo si el valor es un alias
// reconocido (p.ej. "CABA"). No devuelve el texto crudo: así un barrio cualquiera
// cargado en `localidad` ("Palermo") no se confunde con una provincia.
function regionAlias(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return REGION_ALIASES[trimmed.toLowerCase()] ?? null
}

/**
 * ¿El cliente declara CABA? True si la provincia O la localidad es un alias
 * conocido de CABA ("CABA", "Capital Federal", "Ciudad de Buenos Aires", etc.).
 * Se usa para acotar el re-geocodificado SOLO a los clientes de CABA, que son los
 * afectados por el bug histórico (resueltos en otra provincia homónima).
 */
export function esRegionCABA(
  provincia?: string | null,
  localidad?: string | null,
): boolean {
  return regionAlias(provincia) === CABA_CANONICAL || regionAlias(localidad) === CABA_CANONICAL
}

/**
 * Resuelve la región (provincia) esperada a partir de provincia y localidad.
 *
 * Muchos clientes traen la localidad "CABA"/"Capital Federal" pero la provincia
 * vacía o mal cargada. En ese caso Pelias, sin restricción de provincia, puede
 * resolver el domicilio en otra provincia homónima (ej. una calle que también
 * existe en Córdoba). Si la localidad es un alias de provincia conocido, lo
 * tomamos como autoritativo y forzamos la región canónica; si no, normalizamos
 * la provincia tal como venga (los clientes bien cargados no cambian).
 */
export function resolverRegion(
  provincia?: string | null,
  localidad?: string | null,
): string | null {
  const desdeLocalidad = regionAlias(localidad)
  if (desdeLocalidad) return desdeLocalidad
  return normalizeRegion(provincia)
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

// Capas con geometría a nivel calle/dirección: precisas para una parada de
// reparto incluso cuando ORS marca el match como 'fallback' (encontró la calle
// pero no la altura exacta). Un fallback a nivel localidad/país NO entra acá.
const PRECISE_LAYERS = new Set(['address', 'street', 'venue'])

// Strings que ORS/Pelias devuelve en properties.region / region_a para CABA.
// Pelias NO usa el nombre canónico de Who's on First: devuelve el nombre en
// inglés ("Autonomous City of Buenos Aires"), la sigla histórica WOF "CF"
// (Capital Federal), el código ISO 3166-2 "C" (AR-C) y, en algunas versiones,
// "Buenos Aires F.D.". canonRegion() ya les quita acentos, puntos y mayúsculas,
// así que las guardamos acá en su forma canónica para comparar.
const CABA_REGION_VALUES = new Set([
  'ciudad autonoma de buenos aires',
  'autonomous city of buenos aires',
  'capital federal',
  'buenos aires fd',
  'caba',
  'cf',
  'c',
])

type OrsFeatureProperties = {
  layer?: string
  confidence?: number
  match_type?: string
  label?: string
  region?: string
  region_a?: string
  neighbourhood?: string
  postalcode?: string
}

/** Resultado de geocodificación: coordenadas + barrio/CP de la feature elegida. */
export type GeocodeResult = {
  lat: number
  lng: number
  neighbourhood: string | null
  postalcode: string | null
}

// Normaliza un nombre de región para comparar: sin acentos, sin puntos,
// minúsculas y espacios colapsados. Así "Ciudad Autónoma de Buenos Aires",
// "ciudad autonoma de buenos aires" y "C.A.B.A." se vuelven comparables.
function canonRegion(value: string): string {
  return value
    .normalize('NFD')
    // tras NFD, las marcas diacríticas y demás no-ASCII se descartan
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/\./g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// ¿La feature cae dentro de la región pedida? Compara properties.region y
// properties.region_a (la abreviatura WOF, p.ej. "CABA") contra la región
// esperada, contemplando alias. Si no hay match, la feature se descarta.
function regionMatches(expectedRegion: string, props: OrsFeatureProperties | undefined): boolean {
  const expected = canonRegion(expectedRegion)
  if (!expected) return true
  const expectedIsCaba = CABA_REGION_VALUES.has(expected)
  for (const raw of [props?.region, props?.region_a]) {
    if (!raw) continue
    const candidate = canonRegion(raw)
    if (!candidate) continue
    if (candidate === expected) return true
    // CABA aparece con etiquetas muy distintas según el campo y la versión de WOF
    // (inglés "Autonomous City of Buenos Aires", siglas "CF"/"C", "Buenos Aires F.D.").
    // Si la provincia esperada es CABA y la feature trae cualquiera de ellas, matchea.
    if (expectedIsCaba && CABA_REGION_VALUES.has(candidate)) return true
    // alias genérico de entrada (p.ej. region_a "CABA" → nombre canónico)
    const aliased = REGION_ALIASES[candidate]
    if (aliased && canonRegion(aliased) === expected) return true
  }
  return false
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
 *
 * Si se pasa `expectedRegion`, además descarta toda feature que caiga en otra
 * provincia: así un domicilio de CABA nunca se acepta resuelto en Córdoba.
 * Devuelve null si ninguna feature es aceptable.
 */
function pickPreciseCoords(
  features: OrsFeature[] | undefined,
  expectedRegion: string | null,
): GeocodeResult | null {
  for (const f of features ?? []) {
    const layer = f.properties?.layer
    const confidence = f.properties?.confidence
    const matchType = f.properties?.match_type
    if (layer && COARSE_LAYERS.has(layer)) continue
    if (typeof confidence === 'number' && confidence < MIN_CONFIDENCE) continue
    // Validación por región: si pedimos una provincia, la feature debe estar en ella.
    if (expectedRegion && !regionMatches(expectedRegion, f.properties)) continue
    // Un match 'fallback' significa que ORS no ubicó la altura exacta y devolvió la
    // calle/zona. Es aceptable SOLO si (a) teníamos una región esperada —ya validada
    // arriba— y (b) la capa es a nivel calle/dirección: así un domicilio de CABA cuya
    // altura ORS no tiene cae igual en la calle correcta dentro de CABA. Un fallback
    // sin región, o a nivel localidad/país (típico centroide de homónimo en otra
    // provincia), se descarta.
    if (matchType === 'fallback') {
      if (!expectedRegion) continue
      if (!layer || !PRECISE_LAYERS.has(layer)) continue
    }
    const coords = f.geometry?.coordinates
    if (!coords) continue
    // ORS returns [lng, lat]. Barrio y CP salen de ESTA misma feature.
    return {
      lat: coords[1],
      lng: coords[0],
      neighbourhood: f.properties?.neighbourhood?.trim() || null,
      postalcode: f.properties?.postalcode?.trim() || null,
    }
  }
  return null
}

export async function geocodeAddress(
  text: string,
  expectedRegion: string | null = null,
): Promise<GeocodeResult | null> {
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
  const coords = pickPreciseCoords(json.features, expectedRegion)
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
}): Promise<GeocodeResult | null> {
  const key = getOrsKey()
  // Resolvemos la región esperada mirando provincia y, si hace falta, localidad
  // (p.ej. localidad "CABA" con provincia vacía). La usamos tanto para acotar la
  // búsqueda como para validar que el resultado caiga realmente en esa provincia.
  const expectedRegion = resolverRegion(region, locality)
  const url = new URL(ORS_GEOCODE_STRUCTURED_URL)
  url.searchParams.set('api_key', key)
  url.searchParams.set('address', address)
  if (locality) url.searchParams.set('locality', locality)
  if (expectedRegion) url.searchParams.set('region', expectedRegion)
  url.searchParams.set('country', country)
  url.searchParams.set('size', '3')

  const res = await fetch(url.toString())
  if (!res.ok) {
    console.error(`[geocode] ORS structured error ${res.status} para "${address}"`)
  } else {
    const json = await res.json() as OrsResponse
    const coords = pickPreciseCoords(json.features, expectedRegion)
    if (coords) return coords
    console.warn(`[geocode] structured sin resultado preciso para "${address}", probando free-text`)
  }

  // Fallback 1: texto libre con la dirección completa (incluye la localidad/barrio).
  // Mantiene boundary.country=AR y la MISMA validación de región: no se aceptan
  // resultados fuera de la provincia pedida.
  const conLocalidad = [address, locality, expectedRegion].filter(Boolean).join(', ')
  const coordsConLocalidad = await geocodeAddress(conLocalidad, expectedRegion)
  if (coordsConLocalidad) return coordsConLocalidad

  // Fallback 2: cuando la localidad es un BARRIO de CABA (p.ej. "Saavedra", "Palermo",
  // "Recoleta"), Pelias suele quedarse con el centroide del barrio (layer=neighbourhood)
  // e ignorar la calle, y ese resultado grueso se descarta. Reintentamos SIN la
  // localidad —sólo calle + provincia—, que recupera la calle real. La validación de
  // región sigue activa (region_a "CF"/"C" = CABA), así que una calle homónima en otra
  // provincia se sigue descartando. Sólo si hay región esperada, para no abrir la puerta
  // a homónimos cuando no tenemos contra qué validar.
  if (locality && expectedRegion) {
    const sinLocalidad = [address, expectedRegion].join(', ')
    if (sinLocalidad !== conLocalidad) {
      return geocodeAddress(sinLocalidad, expectedRegion)
    }
  }
  return null
}

/**
 * Reverse-geocodifica un punto (lat/lng) para decidir si cae dentro de la
 * provincia esperada. Aplica la MISMA comparación de región de Fase 1
 * (properties.region / region_a, contemplando alias).
 *
 * Devuelve:
 *  - true  → el punto cae en la provincia esperada (coordenadas correctas).
 *  - false → el punto cae en otra provincia (coordenadas a corregir).
 *  - null  → no se pudo determinar (error de API o sin región en la respuesta);
 *            ante la duda, mejor no tocar al cliente.
 */
export async function puntoCaeEnRegion(
  lat: number,
  lng: number,
  expectedRegion: string,
): Promise<boolean | null> {
  const key = getOrsKey()
  const url = new URL(ORS_GEOCODE_REVERSE_URL)
  url.searchParams.set('api_key', key)
  url.searchParams.set('point.lat', String(lat))
  url.searchParams.set('point.lon', String(lng))
  url.searchParams.set('boundary.country', 'AR')
  url.searchParams.set('size', '1')

  const res = await fetch(url.toString())
  if (!res.ok) {
    console.error(`[geocode] ORS reverse error ${res.status} para (${lat}, ${lng})`)
    return null
  }

  const json = await res.json() as OrsResponse
  const props = json.features?.[0]?.properties
  if (!props || (!props.region && !props.region_a)) return null
  return regionMatches(expectedRegion, props)
}
