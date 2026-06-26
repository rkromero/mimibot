/**
 * Tests del servicio de optimización de ruta.
 *
 * Cobertura:
 *  (a) optimizarRutaHeuristica con 4 puntos en línea → orden geográfico correcto.
 *  (b) mejorar2opt deshace un cruce evidente y acorta el recorrido.
 *  (c) parseOrsOptimization mapea job ids → pedidoIds en el orden de los steps.
 *  (d) si fetch a ORS rechaza, se usa el fallback heurístico y no se lanza.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  optimizarRutaHeuristica,
  mejorar2opt,
  parseOrsOptimization,
  distanciaRuta,
  detectarOutliers,
  optimizarRuta,
  type Parada,
} from '@/lib/geo/route-optimizer.service'

// ─── (a) vecino más cercano + 2-opt en línea ───────────────────────────────────

describe('optimizarRutaHeuristica', () => {
  it('(a) 4 puntos en línea → orden geográfico desde el origen', () => {
    const origen = { lat: 0, lng: 0 }
    // Puntos sobre el meridiano, desordenados en la entrada.
    const paradas: Parada[] = [
      { pedidoId: 'p3', lat: 0, lng: 3 },
      { pedidoId: 'p1', lat: 0, lng: 1 },
      { pedidoId: 'p4', lat: 0, lng: 4 },
      { pedidoId: 'p2', lat: 0, lng: 2 },
    ]
    const orden = optimizarRutaHeuristica(origen, paradas)
    expect(orden).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('devuelve el único pedido sin tocar ORS', () => {
    const orden = optimizarRutaHeuristica({ lat: 0, lng: 0 }, [
      { pedidoId: 'solo', lat: 1, lng: 1 },
    ])
    expect(orden).toEqual(['solo'])
  })
})

// ─── (b) 2-opt deshace un cruce ────────────────────────────────────────────────

describe('mejorar2opt', () => {
  it('(b) acorta un recorrido con un cruce evidente', () => {
    const origen = { lat: 0, lng: 0 }
    // Orden con ida y vuelta (p1 → p3 → p2 → p4): el segmento p3→p2 retrocede.
    const cruzado: Parada[] = [
      { pedidoId: 'p1', lat: 0, lng: 1 },
      { pedidoId: 'p3', lat: 0, lng: 3 },
      { pedidoId: 'p2', lat: 0, lng: 2 },
      { pedidoId: 'p4', lat: 0, lng: 4 },
    ]
    const distAntes = distanciaRuta(origen, cruzado)
    const mejorado = mejorar2opt(origen, cruzado)
    const distDespues = distanciaRuta(origen, mejorado)

    expect(distDespues).toBeLessThan(distAntes)
    expect(mejorado.map((p) => p.pedidoId)).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('no muta la entrada', () => {
    const origen = { lat: 0, lng: 0 }
    const entrada: Parada[] = [
      { pedidoId: 'a', lat: 0, lng: 2 },
      { pedidoId: 'b', lat: 0, lng: 1 },
      { pedidoId: 'c', lat: 0, lng: 3 },
    ]
    const copia = JSON.parse(JSON.stringify(entrada))
    mejorar2opt(origen, entrada)
    expect(entrada).toEqual(copia)
  })
})

// ─── (c) parser de respuesta ORS ───────────────────────────────────────────────

describe('parseOrsOptimization', () => {
  const paradas: Parada[] = [
    { pedidoId: 'A', lat: 0, lng: 0 },
    { pedidoId: 'B', lat: 0, lng: 1 },
    { pedidoId: 'C', lat: 0, lng: 2 },
  ]

  it('(c) mapea job ids → pedidoIds en el orden de los steps', () => {
    const json = {
      routes: [
        {
          steps: [
            { type: 'start' },
            { type: 'job', id: 2, job: 2 },
            { type: 'job', id: 3, job: 3 },
            { type: 'job', id: 1, job: 1 },
            { type: 'end' },
          ],
        },
      ],
    }
    expect(parseOrsOptimization(json, paradas)).toEqual(['B', 'C', 'A'])
  })

  it('lee el job id desde el campo `job` cuando no hay `id`', () => {
    const json = {
      routes: [{ steps: [{ type: 'job', job: 1 }, { type: 'job', job: 2 }, { type: 'job', job: 3 }] }],
    }
    expect(parseOrsOptimization(json, paradas)).toEqual(['A', 'B', 'C'])
  })

  it('devuelve null si la respuesta no cubre todas las paradas', () => {
    const json = { routes: [{ steps: [{ type: 'job', id: 1 }] }] }
    expect(parseOrsOptimization(json, paradas)).toBeNull()
  })

  it('devuelve null si no hay rutas', () => {
    expect(parseOrsOptimization({}, paradas)).toBeNull()
  })
})

// ─── (d) fallback ante falla de ORS ────────────────────────────────────────────

describe('optimizarRuta (fallback)', () => {
  const ORIGINAL_KEY = process.env['ORS_API_KEY']

  afterEach(() => {
    vi.unstubAllGlobals()
    if (ORIGINAL_KEY === undefined) delete process.env['ORS_API_KEY']
    else process.env['ORS_API_KEY'] = ORIGINAL_KEY
  })

  it('(d) si fetch a ORS rechaza, usa la heurística y no lanza', async () => {
    process.env['ORS_API_KEY'] = 'test-key'
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)

    const origen = { lat: 0, lng: 0 }
    const paradas: Parada[] = [
      { pedidoId: 'p3', lat: 0, lng: 3 },
      { pedidoId: 'p1', lat: 0, lng: 1 },
      { pedidoId: 'p2', lat: 0, lng: 2 },
    ]

    const { orden, motor } = await optimizarRuta(origen, paradas)

    expect(fetchMock).toHaveBeenCalledOnce()
    // Cae a la heurística → orden geográfico determinista, motor informado.
    expect(orden).toEqual(['p1', 'p2', 'p3'])
    expect(motor).toBe('heuristica')
  })

  it('sin ORS_API_KEY usa la heurística sin tocar la red e informa el motor', async () => {
    delete process.env['ORS_API_KEY']
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { orden, motor } = await optimizarRuta({ lat: 0, lng: 0 }, [
      { pedidoId: 'b', lat: 0, lng: 2 },
      { pedidoId: 'a', lat: 0, lng: 1 },
    ])

    expect(fetchMock).not.toHaveBeenCalled()
    expect(orden).toEqual(['a', 'b'])
    expect(motor).toBe('heuristica')
  })
})

// ─── (g) detección de outliers de ubicación ────────────────────────────────────

describe('detectarOutliers', () => {
  const origen = { lat: -34.6, lng: -58.38 }

  // Cinco paradas agrupadas en CABA/GBA (a pocos km entre sí).
  const enCaba: Parada[] = [
    { pedidoId: 'c1', lat: -34.60, lng: -58.38 },
    { pedidoId: 'c2', lat: -34.61, lng: -58.40 },
    { pedidoId: 'c3', lat: -34.59, lng: -58.37 },
    { pedidoId: 'c4', lat: -34.62, lng: -58.42 },
    { pedidoId: 'c5', lat: -34.58, lng: -58.36 },
  ]

  it('(g) sin outlier: todas las paradas quedan normales', () => {
    const { normales, sospechosas } = detectarOutliers(origen, enCaba)
    expect(sospechosas).toHaveLength(0)
    expect(normales.map((p) => p.pedidoId)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5'])
  })

  it('(g) un cliente a cientos de km (CABA mal geocodificado en Córdoba) queda sospechoso', () => {
    // Córdoba capital: ~650 km de CABA.
    const outlier: Parada = { pedidoId: 'cordoba', lat: -31.42, lng: -64.18 }
    const { normales, sospechosas } = detectarOutliers(origen, [...enCaba, outlier])

    expect(sospechosas.map((p) => p.pedidoId)).toEqual(['cordoba'])
    // El resto sigue intacto y disponible para optimizar normalmente.
    expect(normales.map((p) => p.pedidoId)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5'])
  })

  it('no romper rutas legítimamente dispersas: si los lejanos no son minoría, no se marcan', () => {
    // Mitad CABA, mitad Córdoba: no hay una "anomalía" minoritaria clara.
    const dispersas: Parada[] = [
      { pedidoId: 'a1', lat: -34.60, lng: -58.38 },
      { pedidoId: 'a2', lat: -34.61, lng: -58.40 },
      { pedidoId: 'b1', lat: -31.42, lng: -64.18 },
      { pedidoId: 'b2', lat: -31.40, lng: -64.20 },
    ]
    const { normales, sospechosas } = detectarOutliers(origen, dispersas)
    expect(sospechosas).toHaveLength(0)
    expect(normales).toHaveLength(4)
  })

  it('con muy pocas paradas no se intenta detectar (sin base estadística)', () => {
    const dos: Parada[] = [
      { pedidoId: 'x', lat: -34.6, lng: -58.4 },
      { pedidoId: 'y', lat: -31.4, lng: -64.2 },
    ]
    const { normales, sospechosas } = detectarOutliers(origen, dos)
    expect(sospechosas).toHaveLength(0)
    expect(normales).toHaveLength(2)
  })
})
