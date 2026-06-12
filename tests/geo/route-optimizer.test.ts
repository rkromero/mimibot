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

    const orden = await optimizarRuta(origen, paradas)

    expect(fetchMock).toHaveBeenCalledOnce()
    // Cae a la heurística → orden geográfico determinista.
    expect(orden).toEqual(['p1', 'p2', 'p3'])
  })

  it('sin ORS_API_KEY usa la heurística sin tocar la red', async () => {
    delete process.env['ORS_API_KEY']
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const orden = await optimizarRuta({ lat: 0, lng: 0 }, [
      { pedidoId: 'b', lat: 0, lng: 2 },
      { pedidoId: 'a', lat: 0, lng: 1 },
    ])

    expect(fetchMock).not.toHaveBeenCalled()
    expect(orden).toEqual(['a', 'b'])
  })
})
