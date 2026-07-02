/**
 * Tests: GET /api/geo/sugerir-direccion
 *
 * Cobertura:
 *  1. Sin sesión → 401.
 *  2. Dirección en CABA con neighbourhood/postalcode → { barrio, codigoPostal }.
 *  3. Feature sin neighbourhood/postalcode → { barrio: null, codigoPostal: null } con 200.
 *  4. Geocoder caído (fetch rechaza) → 200 con nulls, nunca 500.
 *  5. Sin ORS_API_KEY (getOrsKey lanza) → 200 con nulls.
 *  6. Sin parámetro direccion → 200 con nulls, sin llamar al geocoder.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuthFn } = vi.hoisted(() => ({ mockAuthFn: vi.fn() }))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))

// Mismo patrón de mocks que tests/geo/ors.test.ts: se stubbea fetch global y
// corre el módulo real lib/geo/ors.ts.
function feature(
  lng: number,
  lat: number,
  region: string,
  extra: Record<string, unknown> = {},
) {
  return {
    geometry: { coordinates: [lng, lat] },
    properties: { layer: 'address', confidence: 0.9, region, ...extra },
  }
}

function stubFetchFeatures(...features: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ features }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const CABA = { lng: -58.4, lat: -34.6 }

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/geo/sugerir-direccion')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

describe('GET /api/geo/sugerir-direccion', () => {
  const ORIGINAL_KEY = process.env['ORS_API_KEY']

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'agent' } })
    process.env['ORS_API_KEY'] = 'test-key'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (ORIGINAL_KEY === undefined) delete process.env['ORS_API_KEY']
    else process.env['ORS_API_KEY'] = ORIGINAL_KEY
  })

  it('1. sin sesión → 401', async () => {
    mockAuthFn.mockResolvedValue(null)
    stubFetchFeatures()

    const { GET } = await import('@/app/api/geo/sugerir-direccion/route')
    const res = await GET(makeRequest({ direccion: 'Av. Corrientes 3247', provincia: 'CABA' }))

    expect(res.status).toBe(401)
  })

  it('2. dirección en CABA → { barrio, codigoPostal } de la feature elegida', async () => {
    stubFetchFeatures(
      feature(CABA.lng, CABA.lat, 'Ciudad Autónoma de Buenos Aires', {
        neighbourhood: 'Balvanera',
        postalcode: '1193',
      }),
    )

    const { GET } = await import('@/app/api/geo/sugerir-direccion/route')
    const res = await GET(makeRequest({
      direccion: 'Av. Corrientes 3247',
      provincia: 'CABA',
      localidad: 'Ciudad Autónoma de Buenos Aires',
    }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ barrio: 'Balvanera', codigoPostal: '1193' })
  })

  it('3. feature sin neighbourhood/postalcode → nulls con 200', async () => {
    stubFetchFeatures(
      feature(CABA.lng, CABA.lat, 'Ciudad Autónoma de Buenos Aires'),
    )

    const { GET } = await import('@/app/api/geo/sugerir-direccion/route')
    const res = await GET(makeRequest({ direccion: 'Av. Corrientes 3247', provincia: 'CABA' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ barrio: null, codigoPostal: null })
  })

  it('4. geocoder caído (fetch rechaza) → 200 con nulls, nunca 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const { GET } = await import('@/app/api/geo/sugerir-direccion/route')
    const res = await GET(makeRequest({ direccion: 'Av. Corrientes 3247', provincia: 'CABA' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ barrio: null, codigoPostal: null })
  })

  it('5. sin ORS_API_KEY configurada → 200 con nulls', async () => {
    delete process.env['ORS_API_KEY']
    stubFetchFeatures()

    const { GET } = await import('@/app/api/geo/sugerir-direccion/route')
    const res = await GET(makeRequest({ direccion: 'Av. Corrientes 3247', provincia: 'CABA' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ barrio: null, codigoPostal: null })
  })

  it('6. sin direccion → 200 con nulls, sin llamar al geocoder', async () => {
    const fetchMock = stubFetchFeatures()

    const { GET } = await import('@/app/api/geo/sugerir-direccion/route')
    const res = await GET(makeRequest({ provincia: 'CABA' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ barrio: null, codigoPostal: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
