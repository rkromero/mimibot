// Cliente del servicio público USIG (GCBA) — fuente oficial del barrio de CABA.
// No requiere API key. Los polígonos de barrio de OSM/Who's on First no coinciden
// con los límites oficiales de los 48 barrios porteños (p.ej. "Flores" donde el
// barrio oficial es "Vélez Sársfield"), así que para CABA el barrio sale de acá.
//
// Flujo: normalizar (texto libre → dirección normalizada + lat/lng WGS84) y
// datos_utiles (lat/lng → barrio oficial). Best-effort: cualquier falla → null.

const USIG_NORMALIZAR_URL = 'https://servicios.usig.buenosaires.gob.ar/normalizar/'
const USIG_DATOS_UTILES_URL = 'https://ws.usig.buenosaires.gob.ar/datos_utiles'
const TIMEOUT_MS = 5000

type NormalizarResponse = {
  direccionesNormalizadas?: Array<{
    tipo?: string
    coordenadas?: { x?: string | number; y?: string | number; srid?: number }
  }>
}

type DatosUtilesResponse = {
  barrio?: string
}

export async function obtenerBarrioOficialCABA(direccion: string): Promise<string | null> {
  try {
    const normUrl = new URL(USIG_NORMALIZAR_URL)
    normUrl.searchParams.set('direccion', direccion)
    normUrl.searchParams.set('maxOptions', '1')
    // Sin geocodificar=true la respuesta a veces omite las coordenadas;
    // srid=4326 fuerza WGS84 (lat/lng), que es lo que espera datos_utiles.
    normUrl.searchParams.set('geocodificar', 'true')
    normUrl.searchParams.set('srid', '4326')
    const normRes = await fetch(normUrl.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!normRes.ok) return null

    const norm = await normRes.json() as NormalizarResponse
    const coords = norm.direccionesNormalizadas?.[0]?.coordenadas
    const lng = Number(coords?.x)
    const lat = Number(coords?.y)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null

    const datosUrl = new URL(USIG_DATOS_UTILES_URL)
    datosUrl.searchParams.set('x', String(lng))
    datosUrl.searchParams.set('y', String(lat))
    const datosRes = await fetch(datosUrl.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!datosRes.ok) return null

    const datos = await datosRes.json() as DatosUtilesResponse
    const barrio = typeof datos.barrio === 'string' ? datos.barrio.trim() : ''
    return barrio || null
  } catch {
    // Best-effort: sin USIG se cae al neighbourhood del geocoder ORS/OSM
    return null
  }
}
