/**
 * Tests de geocodificación ORS con validación por región.
 *
 * El objetivo es que un domicilio de CABA nunca termine geocodificado en otra
 * provincia. Cubre:
 *  (a) resolverRegion: 'CABA' en localidad fuerza CABA aunque la provincia esté
 *      vacía; las provincias bien cargadas no se alteran.
 *  (b) geocodeStructured: con localidad CABA + provincia vacía acepta el match
 *      que cae en CABA.
 *  (c) geocodeStructured: si el único match cae en otra provincia (Córdoba),
 *      devuelve null → el cliente queda failed y se navega por texto.
 *  (d) no se rompe el geocodificado de provincias bien cargadas ni de clientes
 *      sin provincia/localidad reconocible.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolverRegion, geocodeStructured } from '@/lib/geo/ors'

// Construye una feature de ORS/Pelias precisa (layer address, alta confianza).
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

// Mock de fetch que responde a CUALQUIER request con el mismo payload de features.
function stubFetchFeatures(...features: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ features }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// Mock de fetch que decide las features según la URL pedida (para distinguir
// la búsqueda CON barrio de la búsqueda SIN barrio).
function stubFetchByQuery(handler: (url: URL) => unknown[]) {
  const fetchMock = vi.fn(async (urlStr: string) => ({
    ok: true,
    json: async () => ({ features: handler(new URL(urlStr)) }),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// Coordenadas de referencia (no importan los valores exactos, sólo de qué feature salen).
const CABA = { lng: -58.4, lat: -34.6 }
const CORDOBA = { lng: -64.18, lat: -31.42 }

// ─── (a) resolverRegion ─────────────────────────────────────────────────────────

describe('resolverRegion', () => {
  it("(a) 'CABA' en localidad con provincia vacía → fuerza CABA", () => {
    expect(resolverRegion('', 'CABA')).toBe('Ciudad Autónoma de Buenos Aires')
    expect(resolverRegion(null, 'Capital Federal')).toBe('Ciudad Autónoma de Buenos Aires')
  })

  it('una provincia bien cargada se mantiene tal cual', () => {
    expect(resolverRegion('Córdoba', 'Villa Carlos Paz')).toBe('Córdoba')
    expect(resolverRegion('Buenos Aires', 'La Plata')).toBe('Buenos Aires')
  })

  it("provincia 'CABA' (alias) se normaliza al nombre canónico", () => {
    expect(resolverRegion('CABA', 'Recoleta')).toBe('Ciudad Autónoma de Buenos Aires')
  })

  it('sin provincia ni localidad reconocible → null (sin restricción de región)', () => {
    expect(resolverRegion('', '')).toBeNull()
    expect(resolverRegion(null, 'Rosario')).toBeNull()
  })
})

// ─── (b)(c)(d) geocodeStructured con validación de región ────────────────────────

describe('geocodeStructured (validación por región)', () => {
  const ORIGINAL_KEY = process.env['ORS_API_KEY']

  afterEach(() => {
    vi.unstubAllGlobals()
    if (ORIGINAL_KEY === undefined) delete process.env['ORS_API_KEY']
    else process.env['ORS_API_KEY'] = ORIGINAL_KEY
  })

  it('(b) localidad CABA + provincia vacía → se geocodifica dentro de CABA', async () => {
    process.env['ORS_API_KEY'] = 'test-key'
    stubFetchFeatures(
      feature(CABA.lng, CABA.lat, 'Ciudad Autónoma de Buenos Aires'),
    )

    const result = await geocodeStructured({
      address: 'Av. Corrientes 1234',
      locality: 'CABA',
      region: '',
    })

    expect(result).toMatchObject({ lat: CABA.lat, lng: CABA.lng })
  })

  it('(c) único match en otra provincia (Córdoba) → null (cliente failed)', async () => {
    process.env['ORS_API_KEY'] = 'test-key'
    // Tanto la búsqueda estructurada como el fallback de texto libre devuelven
    // únicamente una feature en Córdoba; al pedir CABA debe descartarse → null.
    stubFetchFeatures(
      feature(CORDOBA.lng, CORDOBA.lat, 'Córdoba'),
    )

    const result = await geocodeStructured({
      address: 'San Martín 100',
      locality: 'CABA',
      region: '',
    })

    expect(result).toBeNull()
  })

  it('acepta el match correcto descartando el de otra provincia', async () => {
    process.env['ORS_API_KEY'] = 'test-key'
    // Pelias devuelve primero un homónimo en Córdoba y luego el real en CABA:
    // la feature de Córdoba se descarta y se toma la de CABA.
    stubFetchFeatures(
      feature(CORDOBA.lng, CORDOBA.lat, 'Córdoba'),
      feature(CABA.lng, CABA.lat, 'Ciudad Autónoma de Buenos Aires'),
    )

    const result = await geocodeStructured({
      address: 'San Martín 100',
      locality: 'CABA',
      region: '',
    })

    expect(result).toMatchObject({ lat: CABA.lat, lng: CABA.lng })
  })

  it('matchea por la abreviatura region_a ("CABA")', async () => {
    process.env['ORS_API_KEY'] = 'test-key'
    stubFetchFeatures(
      feature(CABA.lng, CABA.lat, 'Buenos Aires F.D.', { region_a: 'CABA' }),
    )

    const result = await geocodeStructured({
      address: 'Florida 500',
      locality: 'CABA',
      region: '',
    })

    expect(result).toMatchObject({ lat: CABA.lat, lng: CABA.lng })
  })

  // ── Variantes REALES que ORS/Pelias devuelve para CABA ───────────────────────
  // (verificadas contra la API en prod: region en inglés y region_a "CF").

  it('acepta el match exacto real de ORS para CABA (region inglés + region_a "CF")', async () => {
    process.env['ORS_API_KEY'] = 'test-key'
    stubFetchFeatures(
      feature(CABA.lng, CABA.lat, 'Autonomous City of Buenos Aires', {
        region_a: 'CF',
        layer: 'address',
        match_type: 'exact',
        confidence: 1,
      }),
    )

    const result = await geocodeStructured({ address: 'Av. Córdoba 2621', locality: 'CABA', region: '' })

    expect(result).toMatchObject({ lat: CABA.lat, lng: CABA.lng })
  })

  it('acepta un fallback a nivel calle dentro de CABA (ORS no tiene la altura exacta)', async () => {
    process.env['ORS_API_KEY'] = 'test-key'
    stubFetchFeatures(
      feature(CABA.lng, CABA.lat, 'Autonomous City of Buenos Aires', {
        region_a: 'CF',
        layer: 'street',
        match_type: 'fallback',
        confidence: 0.8,
      }),
    )

    const result = await geocodeStructured({ address: 'Sánchez de Bustamante 1646', locality: 'CABA', region: '' })

    expect(result).toMatchObject({ lat: CABA.lat, lng: CABA.lng })
  })

  it('matchea por region_a "C" (código ISO AR-C) aunque region diga "Buenos Aires"', async () => {
    process.env['ORS_API_KEY'] = 'test-key'
    stubFetchFeatures(
      feature(CABA.lng, CABA.lat, 'Buenos Aires', {
        region_a: 'C',
        layer: 'address',
        match_type: 'exact',
      }),
    )

    const result = await geocodeStructured({ address: 'Florida 100', locality: 'CABA', region: '' })

    expect(result).toMatchObject({ lat: CABA.lat, lng: CABA.lng })
  })

  it('rechaza un homónimo en la PROVINCIA de Buenos Aires (region_a "BA") para un cliente CABA', async () => {
    process.env['ORS_API_KEY'] = 'test-key'
    // Misma calle pero en la provincia de Buenos Aires (BA), no en CABA → debe descartarse.
    stubFetchFeatures(
      feature(CORDOBA.lng, CORDOBA.lat, 'Buenos Aires', {
        region_a: 'BA',
        layer: 'street',
        match_type: 'fallback',
        confidence: 0.8,
      }),
    )

    const result = await geocodeStructured({ address: 'Sánchez de Bustamante 1646', locality: 'CABA', region: '' })

    expect(result).toBeNull()
  })

  it('descarta un fallback cuando no hay región esperada (evita homónimos)', async () => {
    process.env['ORS_API_KEY'] = 'test-key'
    // Sin provincia/localidad reconocible no hay contra qué validar: un fallback a nivel
    // calle podría ser un homónimo en cualquier provincia, así que no se acepta.
    stubFetchFeatures(
      feature(CORDOBA.lng, CORDOBA.lat, 'Córdoba', {
        region_a: 'X',
        layer: 'street',
        match_type: 'fallback',
        confidence: 0.8,
      }),
    )

    const result = await geocodeStructured({ address: 'Mitre 50', locality: 'Rosario', region: '' })

    expect(result).toBeNull()
  })

  it('descarta un fallback a nivel localidad aunque caiga en CABA (no es lo bastante preciso)', async () => {
    process.env['ORS_API_KEY'] = 'test-key'
    stubFetchFeatures(
      feature(CABA.lng, CABA.lat, 'Autonomous City of Buenos Aires', {
        region_a: 'CF',
        layer: 'locality',
        match_type: 'fallback',
        confidence: 0.6,
      }),
    )

    const result = await geocodeStructured({ address: 'Calle Inexistente 9999', locality: 'CABA', region: '' })

    expect(result).toBeNull()
  })

  it('reintenta SIN el barrio cuando la localidad secuestra el geocode al centroide del barrio', async () => {
    process.env['ORS_API_KEY'] = 'test-key'
    // Con el barrio en el texto ("Saavedra"), Pelias devuelve el centroide del barrio
    // (layer=neighbourhood, fallback) → se descarta. Sin el barrio, devuelve la calle
    // real (layer=street, fallback, CABA) → se acepta.
    stubFetchByQuery((url) => {
      const text = url.searchParams.get('text') ?? ''
      if (url.pathname.includes('/structured')) {
        // structured: sólo un fallback grueso a nivel país → se descarta
        return [feature(-64, -34, 'Argentina', { layer: 'country', match_type: 'fallback', confidence: 0.1 })]
      }
      if (/saavedra/i.test(text)) {
        return [feature(CABA.lng, CABA.lat, 'Autonomous City of Buenos Aires', {
          region_a: 'CF', layer: 'neighbourhood', match_type: 'fallback', confidence: 0.6,
        })]
      }
      return [feature(CABA.lng, CABA.lat, 'Autonomous City of Buenos Aires', {
        region_a: 'CF', layer: 'street', match_type: 'fallback', confidence: 0.8,
      })]
    })

    const result = await geocodeStructured({ address: 'Núñez 6349', locality: 'Saavedra', region: 'CABA' })

    expect(result).toMatchObject({ lat: CABA.lat, lng: CABA.lng })
  })

  it('mapea neighbourhood/postalcode de la MISMA feature elegida (no de una descartada)', async () => {
    process.env['ORS_API_KEY'] = 'test-key'
    // La primera feature (Córdoba, con otro barrio/CP) se descarta por región;
    // barrio y CP deben salir de la segunda, que es la elegida.
    stubFetchFeatures(
      feature(CORDOBA.lng, CORDOBA.lat, 'Córdoba', { neighbourhood: 'Alberdi', postalcode: '5000' }),
      feature(CABA.lng, CABA.lat, 'Ciudad Autónoma de Buenos Aires', {
        neighbourhood: 'Balvanera',
        postalcode: '1193',
      }),
    )

    const result = await geocodeStructured({
      address: 'Av. Corrientes 3247',
      locality: 'CABA',
      region: '',
    })

    expect(result).toEqual({
      lat: CABA.lat,
      lng: CABA.lng,
      neighbourhood: 'Balvanera',
      postalcode: '1193',
    })
  })

  it('feature sin neighbourhood/postalcode → null en ambos campos', async () => {
    process.env['ORS_API_KEY'] = 'test-key'
    stubFetchFeatures(
      feature(CABA.lng, CABA.lat, 'Ciudad Autónoma de Buenos Aires'),
    )

    const result = await geocodeStructured({
      address: 'Av. Corrientes 1234',
      locality: 'CABA',
      region: '',
    })

    expect(result).toEqual({
      lat: CABA.lat,
      lng: CABA.lng,
      neighbourhood: null,
      postalcode: null,
    })
  })

  it('(d) provincia bien cargada (Córdoba) sigue geocodificando', async () => {
    process.env['ORS_API_KEY'] = 'test-key'
    stubFetchFeatures(
      feature(CORDOBA.lng, CORDOBA.lat, 'Córdoba'),
    )

    const result = await geocodeStructured({
      address: 'Av. Colón 100',
      locality: 'Córdoba',
      region: 'Córdoba',
    })

    expect(result).toMatchObject({ lat: CORDOBA.lat, lng: CORDOBA.lng })
  })

  it('(d) sin región esperada no se filtra por provincia (comportamiento previo)', async () => {
    process.env['ORS_API_KEY'] = 'test-key'
    // provincia y localidad no definen una provincia → se acepta la feature precisa.
    stubFetchFeatures(
      feature(CORDOBA.lng, CORDOBA.lat, 'Córdoba'),
    )

    const result = await geocodeStructured({
      address: 'Mitre 50',
      locality: 'Rosario',
      region: '',
    })

    expect(result).toMatchObject({ lat: CORDOBA.lat, lng: CORDOBA.lng })
  })
})
