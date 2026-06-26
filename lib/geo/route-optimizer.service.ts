// Optimización del orden de entrega de una ruta de reparto.
//
// Estrategia principal: OpenRouteService /optimization (motor VROOM) que resuelve
// el problema del vehículo con tiempos de viaje reales por calle.
//
// Fallback (sin red / sin API key / timeout / demasiadas paradas): heurística de
// vecino más cercano sobre distancia haversine, seguida de mejora 2-opt. La
// heurística es pura y se exporta para poder testearla de forma determinista.
//
// IMPORTANTE: ORS trabaja con coordenadas [lng, lat] (GeoJSON), no [lat, lng].

import { getOrsKey } from './ors'

const ORS_OPTIMIZATION_URL = 'https://api.openrouteservice.org/optimization'
const ORS_TIMEOUT_MS = 10_000
// VROOM/ORS escala bien, pero por costo y latencia caemos a la heurística local
// cuando hay demasiadas paradas.
const MAX_PARADAS_ORS = 50

export type Coordenada = { lat: number; lng: number }
export type Parada = { pedidoId: string; lat: number; lng: number }

// ─── Distancia haversine ───────────────────────────────────────────────────────

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Distancia en kilómetros entre dos coordenadas (esfera terrestre). */
export function haversineKm(a: Coordenada, b: Coordenada): number {
  const R = 6371 // radio terrestre medio en km
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Longitud total de una ruta abierta que parte del origen y visita las paradas en orden. */
export function distanciaRuta(origen: Coordenada, paradas: Parada[]): number {
  let total = 0
  let prev: Coordenada = origen
  for (const p of paradas) {
    total += haversineKm(prev, p)
    prev = p
  }
  return total
}

// ─── Detección de paradas outlier ──────────────────────────────────────────────
//
// Una sola coordenada mal geocodificada (ej. un domicilio de CABA que cayó en
// Córdoba) entra como parada real y, al estar a cientos de km del resto, arruina
// el orden de TODA la ruta. La separamos antes de optimizar: el grueso de paradas
// se optimiza normal y las sospechosas se mandan al final para revisión manual.

export type DeteccionOutliers = { normales: Parada[]; sospechosas: Parada[] }

// > este umbral absoluto desde el centro ⇒ sospechosa, sin importar la dispersión.
const OUTLIER_ABS_KM = 150
// o si está más de k veces la mediana de distancias (dispersión relativa).
const OUTLIER_MEDIAN_FACTOR = 5
// piso absoluto: en un radio chico no marcamos la dispersión urbana normal.
const OUTLIER_MIN_KM = 25
// con menos de esto no hay una mayoría estadística confiable para decidir.
const MIN_PARADAS_DETECCION = 4

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0
  const ord = [...valores].sort((a, b) => a - b)
  const mid = Math.floor(ord.length / 2)
  return ord.length % 2 === 1 ? ord[mid]! : (ord[mid - 1]! + ord[mid]!) / 2
}

/**
 * Centro robusto del conjunto de paradas: mediana por coordenada. A diferencia
 * del promedio, un punto lejano no lo arrastra, así el centro queda donde está
 * el grueso de las paradas.
 */
function centroRobusto(paradas: Parada[]): Coordenada {
  return {
    lat: mediana(paradas.map((p) => p.lat)),
    lng: mediana(paradas.map((p) => p.lng)),
  }
}

/**
 * Separa las paradas en `normales` y `sospechosas` (outliers de ubicación).
 * Pura y determinista. Criterio: distancia haversine de cada parada al centro
 * robusto del conjunto; es sospechosa si supera el umbral absoluto (150 km) o
 * k veces la mediana de distancias (con un piso de 25 km). Si los "outliers" no
 * son una minoría clara, no se confía en la detección y se devuelven todas como
 * normales (evita romper rutas legítimamente dispersas).
 */
export function detectarOutliers(origen: Coordenada, paradas: Parada[]): DeteccionOutliers {
  void origen // el centro se calcula sobre las paradas; el origen se mantiene por simetría de API
  if (paradas.length < MIN_PARADAS_DETECCION) {
    return { normales: [...paradas], sospechosas: [] }
  }

  const centro = centroRobusto(paradas)
  const distancias = paradas.map((p) => haversineKm(centro, p))
  const med = mediana(distancias)
  const umbralRelativo = Math.max(OUTLIER_MIN_KM, OUTLIER_MEDIAN_FACTOR * med)

  const normales: Parada[] = []
  const sospechosas: Parada[] = []
  paradas.forEach((p, i) => {
    const d = distancias[i]!
    if (d > OUTLIER_ABS_KM || d > umbralRelativo) sospechosas.push(p)
    else normales.push(p)
  })

  // Los outliers deben ser minoría: si no, la "anomalía" es en realidad el patrón.
  if (sospechosas.length * 2 >= paradas.length) {
    return { normales: [...paradas], sospechosas: [] }
  }
  return { normales, sospechosas }
}

// ─── Heurística: vecino más cercano + 2-opt ────────────────────────────────────

function vecinoMasCercano(origen: Coordenada, paradas: Parada[]): Parada[] {
  const restantes = [...paradas]
  const ordenadas: Parada[] = []
  let actual: Coordenada = origen

  while (restantes.length > 0) {
    let mejorIdx = 0
    let mejorDist = Infinity
    for (let i = 0; i < restantes.length; i++) {
      const candidato = restantes[i]
      if (!candidato) continue
      const d = haversineKm(actual, candidato)
      if (d < mejorDist) {
        mejorDist = d
        mejorIdx = i
      }
    }
    const siguiente = restantes.splice(mejorIdx, 1)[0]
    if (!siguiente) break
    ordenadas.push(siguiente)
    actual = siguiente
  }

  return ordenadas
}

/**
 * Mejora 2-opt sobre una ruta abierta con origen fijo: revierte segmentos mientras
 * eso acorte el recorrido total. Pura: no muta la entrada.
 */
export function mejorar2opt(origen: Coordenada, paradas: Parada[]): Parada[] {
  if (paradas.length < 3) return [...paradas]

  let mejor = [...paradas]
  let mejorDist = distanciaRuta(origen, mejor)
  let huboMejora = true

  while (huboMejora) {
    huboMejora = false
    for (let i = 0; i < mejor.length - 1; i++) {
      for (let k = i + 1; k < mejor.length; k++) {
        const candidato = [
          ...mejor.slice(0, i),
          ...mejor.slice(i, k + 1).reverse(),
          ...mejor.slice(k + 1),
        ]
        const dist = distanciaRuta(origen, candidato)
        if (dist < mejorDist - 1e-9) {
          mejor = candidato
          mejorDist = dist
          huboMejora = true
        }
      }
    }
  }

  return mejor
}

/**
 * Orden óptimo aproximado (vecino más cercano + 2-opt). Devuelve los pedidoIds
 * en el orden de visita. Pura y determinista — usada como fallback de ORS y en tests.
 */
export function optimizarRutaHeuristica(origen: Coordenada, paradas: Parada[]): string[] {
  if (paradas.length <= 1) return paradas.map((p) => p.pedidoId)
  const inicial = vecinoMasCercano(origen, paradas)
  const mejorado = mejorar2opt(origen, inicial)
  return mejorado.map((p) => p.pedidoId)
}

// ─── Parser de la respuesta de ORS optimization ────────────────────────────────

type OrsStep = { type?: string; job?: number; id?: number }
type OrsRoute = { steps?: OrsStep[] }
type OrsOptimizationResponse = { routes?: OrsRoute[] }

/**
 * Mapea los steps de tipo 'job' de la respuesta de ORS al orden de pedidoIds.
 * Cada job se creó con `id = índice + 1`, por lo que jobId → paradas[jobId - 1].
 * Devuelve null si la respuesta no cubre todas las paradas (respuesta inválida).
 */
export function parseOrsOptimization(
  json: OrsOptimizationResponse,
  paradas: Parada[],
): string[] | null {
  const steps = json.routes?.[0]?.steps
  if (!steps || steps.length === 0) return null

  const orden: string[] = []
  for (const step of steps) {
    if (step.type !== 'job') continue
    const jobId = step.job ?? step.id
    if (typeof jobId !== 'number') continue
    const parada = paradas[jobId - 1]
    if (parada) orden.push(parada.pedidoId)
  }

  return orden.length === paradas.length ? orden : null
}

// ─── Entrada pública ───────────────────────────────────────────────────────────

/** Motor que finalmente resolvió el orden: ORS (calles reales) o la heurística local. */
export type Motor = 'ors' | 'heuristica'
export type ResultadoOptimizacion = { orden: string[]; motor: Motor }

/**
 * Calcula el orden óptimo de entrega de las paradas partiendo del origen.
 * Intenta ORS y, ante cualquier falla (sin key, error HTTP, timeout, respuesta
 * inválida, demasiadas paradas), cae a la heurística local. Nunca lanza por
 * fallas de ORS: loguea y usa el fallback.
 *
 * Devuelve también `motor` ('ors' | 'heuristica') para dar visibilidad de qué
 * estrategia se usó (clave: detectar en producción que ORS no está activo y se
 * está cayendo a la heurística de línea recta).
 */
export async function optimizarRuta(
  origen: Coordenada,
  paradas: Parada[],
): Promise<ResultadoOptimizacion> {
  if (paradas.length === 0) return { orden: [], motor: 'heuristica' }
  if (paradas.length === 1) {
    const unica = paradas[0]
    return { orden: unica ? [unica.pedidoId] : [], motor: 'heuristica' }
  }

  if (paradas.length > MAX_PARADAS_ORS) {
    console.warn(
      `[route-optimizer] ${paradas.length} paradas (> ${MAX_PARADAS_ORS}), usando heurística local`,
    )
    return { orden: optimizarRutaHeuristica(origen, paradas), motor: 'heuristica' }
  }

  let key: string
  try {
    key = getOrsKey()
  } catch {
    console.warn(
      '[route-optimizer] ORS_API_KEY no configurada: ruta por línea recta (heurística). ' +
        'Seteá ORS_API_KEY en producción para optimizar por calles reales.',
    )
    return { orden: optimizarRutaHeuristica(origen, paradas), motor: 'heuristica' }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ORS_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(ORS_OPTIMIZATION_URL, {
        method: 'POST',
        headers: {
          Authorization: key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vehicles: [
            { id: 1, profile: 'driving-car', start: [origen.lng, origen.lat] },
          ],
          jobs: paradas.map((p, i) => ({ id: i + 1, location: [p.lng, p.lat] })),
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!res.ok) {
      console.error(`[route-optimizer] ORS optimization error ${res.status}, usando heurística`)
      return { orden: optimizarRutaHeuristica(origen, paradas), motor: 'heuristica' }
    }

    const json = (await res.json()) as OrsOptimizationResponse
    const orden = parseOrsOptimization(json, paradas)
    if (!orden) {
      console.error('[route-optimizer] respuesta de ORS inválida, usando heurística')
      return { orden: optimizarRutaHeuristica(origen, paradas), motor: 'heuristica' }
    }
    return { orden, motor: 'ors' }
  } catch (err) {
    console.error('[route-optimizer] falló la llamada a ORS, usando heurística', err)
    return { orden: optimizarRutaHeuristica(origen, paradas), motor: 'heuristica' }
  }
}
