import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { geocodeStructured } from '@/lib/geo/ors'
import { esProvinciaCABA } from '@/lib/validations/clientes'
import { obtenerBarrioOficialCABA } from '@/lib/geo/usig'

// Sugerencia best-effort de barrio y código postal a partir de la dirección.
// Para CABA el barrio sale de USIG (fuente oficial del GCBA); el código postal
// y el barrio fuera de CABA salen del geocoder ORS/OSM cuando el dato existe.
// Nunca responde 500: si los geocoders fallan, devuelve nulls y el usuario
// completa a mano.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const direccion = req.nextUrl.searchParams.get('direccion')?.trim()
  const provincia = req.nextUrl.searchParams.get('provincia')?.trim() || null
  const localidad = req.nextUrl.searchParams.get('localidad')?.trim() || null

  if (!direccion) {
    return NextResponse.json({ barrio: null, codigoPostal: null })
  }

  // Cada fuente falla por separado sin arrastrar a la otra (p.ej. ORS sin API
  // key no debe descartar el barrio que USIG sí resolvió).
  const [barrioOficial, ors] = await Promise.all([
    // CABA se identifica por el campo provincia (regla de negocio)
    esProvinciaCABA(provincia)
      ? obtenerBarrioOficialCABA(direccion)
      : Promise.resolve(null),
    (async () => {
      try {
        return await geocodeStructured({ address: direccion, locality: localidad, region: provincia })
      } catch (err) {
        console.warn('[geo] sugerir-direccion (ORS) falló:', err instanceof Error ? err.message : err)
        return null
      }
    })(),
  ])

  return NextResponse.json({
    barrio: barrioOficial ?? ors?.neighbourhood ?? null,
    codigoPostal: ors?.postalcode ?? null,
  })
}
