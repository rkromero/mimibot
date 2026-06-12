/**
 * Tests de los helpers puros de la UI de ruta del repartidor.
 *
 * No hay infraestructura de testing de componentes (vitest corre en 'node', sin
 * @testing-library/react), así que se testea la lógica extraída a helpers puros:
 *  - construirMapsUrl con lat/lng
 *  - construirMapsUrl con dirección urlencodeada (y fallback al nombre)
 *  - obtenerUbicacion: éxito, permiso denegado, y geolocalización no disponible
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  construirMapsUrl,
  obtenerUbicacion,
  GeolocationDeniedError,
} from '@/lib/repartidor/route-ui'

const BASE = 'https://www.google.com/maps/dir/?api=1&destination='

// ─── construirMapsUrl ──────────────────────────────────────────────────────────

describe('construirMapsUrl', () => {
  it('usa lat,lng cuando el cliente tiene coordenadas', () => {
    const url = construirMapsUrl({
      lat: -34.6037,
      lng: -58.3816,
      direccion: 'Av. Siempreviva 742',
      localidad: 'CABA',
      provincia: 'Buenos Aires',
      nombre: 'Juan',
      apellido: 'Pérez',
    })
    expect(url).toBe(`${BASE}-34.6037,-58.3816`)
  })

  it('usa la dirección urlencodeada cuando no hay coordenadas', () => {
    const url = construirMapsUrl({
      lat: null,
      lng: null,
      direccion: 'Av. Siempre Viva 742',
      localidad: 'Springfield',
      provincia: 'Buenos Aires',
      nombre: 'Juan',
      apellido: 'Pérez',
    })
    expect(url).toBe(`${BASE}${encodeURIComponent('Av. Siempre Viva 742, Springfield, Buenos Aires')}`)
    // Verifica que efectivamente esté urlencodeado (espacios → %20).
    expect(url).toContain('%20')
    expect(url).not.toContain(' ')
  })

  it('cae al nombre del cliente cuando no hay coordenadas ni dirección', () => {
    const url = construirMapsUrl({
      lat: null,
      lng: null,
      direccion: null,
      localidad: null,
      provincia: null,
      nombre: 'María',
      apellido: 'Gómez',
    })
    expect(url).toBe(`${BASE}${encodeURIComponent('María Gómez')}`)
  })
})

// ─── obtenerUbicacion ──────────────────────────────────────────────────────────

describe('obtenerUbicacion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resuelve con las coordenadas y pide alta precisión con timeout 10s', async () => {
    const getCurrentPosition = vi.fn(
      (success: (p: { coords: { latitude: number; longitude: number } }) => void) =>
        success({ coords: { latitude: -34.6, longitude: -58.4 } }),
    )
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })

    const pos = await obtenerUbicacion()

    expect(pos).toEqual({ lat: -34.6, lng: -58.4 })
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  })

  it('rechaza con GeolocationDeniedError cuando se niega el permiso (code 1)', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (
          _success: unknown,
          error: (e: { code: number; message: string }) => void,
        ) => error({ code: 1, message: 'User denied Geolocation' }),
      },
    })

    await expect(obtenerUbicacion()).rejects.toBeInstanceOf(GeolocationDeniedError)
  })

  it('rechaza con Error genérico ante otros fallos (timeout)', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (
          _success: unknown,
          error: (e: { code: number; message: string }) => void,
        ) => error({ code: 3, message: 'Timeout expired' }),
      },
    })

    const promesa = obtenerUbicacion()
    await expect(promesa).rejects.toThrow('Timeout expired')
    await expect(promesa).rejects.not.toBeInstanceOf(GeolocationDeniedError)
  })

  it('rechaza con GeolocationDeniedError si la geolocalización no está disponible', async () => {
    vi.stubGlobal('navigator', {})
    await expect(obtenerUbicacion()).rejects.toBeInstanceOf(GeolocationDeniedError)
  })
})
