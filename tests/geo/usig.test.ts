/**
 * Tests: cliente USIG (barrio oficial de CABA)
 *
 * Cobertura:
 *  1. Happy path: normalizar → coords WGS84 → datos_utiles → barrio oficial.
 *  2. Normalizar sin resultados → null (y no consulta datos_utiles).
 *  3. Red caída (fetch rechaza) → null, sin excepción.
 *  4. datos_utiles sin barrio → null.
 *  5. Respuesta con forma inesperada → null.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { obtenerBarrioOficialCABA } from '@/lib/geo/usig'

// Respuestas reales de los servicios (verificadas contra la API pública):
// normalizar devuelve coordenadas WGS84 (srid 4326) como strings.
const NORMALIZAR_OK = {
  direccionesNormalizadas: [
    {
      altura: 4261,
      coordenadas: { srid: 4326, x: '-58.488835', y: '-34.629700' },
      direccion: 'ARANGUREN, JUAN F., DR. 4261, CABA',
      nombre_calle: 'ARANGUREN, JUAN F., DR.',
      tipo: 'calle_altura',
    },
  ],
}

const DATOS_UTILES_OK = {
  comuna: 'Comuna 10',
  barrio: 'Velez Sarsfield',
  comisaria: '43',
}

function stubFetchByUrl(handler: (url: URL) => unknown) {
  const fetchMock = vi.fn(async (urlStr: string) => ({
    ok: true,
    json: async () => handler(new URL(urlStr)),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('obtenerBarrioOficialCABA', () => {
  it('1. normaliza la dirección y devuelve el barrio oficial de datos_utiles', async () => {
    const fetchMock = stubFetchByUrl((url) =>
      url.pathname.includes('normalizar') ? NORMALIZAR_OK : DATOS_UTILES_OK,
    )

    const barrio = await obtenerBarrioOficialCABA('Aranguren 4261')

    expect(barrio).toBe('Velez Sarsfield')
    // datos_utiles se consulta con las coordenadas WGS84 de la normalización
    const datosCall = fetchMock.mock.calls.find(([u]) => String(u).includes('datos_utiles'))
    expect(datosCall).toBeDefined()
    const datosUrl = new URL(String(datosCall![0]))
    expect(datosUrl.searchParams.get('x')).toBe('-58.488835')
    expect(datosUrl.searchParams.get('y')).toBe('-34.6297')
  })

  it('2. normalizar sin resultados → null y no consulta datos_utiles', async () => {
    const fetchMock = stubFetchByUrl(() => ({ direccionesNormalizadas: [] }))

    const barrio = await obtenerBarrioOficialCABA('Calle Inexistente 99999')

    expect(barrio).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('3. red caída → null sin excepción', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    await expect(obtenerBarrioOficialCABA('Aranguren 4261')).resolves.toBeNull()
  })

  it('4. datos_utiles sin barrio → null', async () => {
    stubFetchByUrl((url) =>
      url.pathname.includes('normalizar') ? NORMALIZAR_OK : { comuna: 'Comuna 10', barrio: '' },
    )

    await expect(obtenerBarrioOficialCABA('Aranguren 4261')).resolves.toBeNull()
  })

  it('5. respuesta con forma inesperada → null', async () => {
    stubFetchByUrl(() => ({ features: [] }))

    await expect(obtenerBarrioOficialCABA('Aranguren 4261')).resolves.toBeNull()
  })
})
