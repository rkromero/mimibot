import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { geocodeStructured } from '@/lib/geo/ors'

// Sugerencia best-effort de barrio y código postal a partir de la dirección.
// Nunca responde 500: si el geocoder falla o no trae datos, devuelve nulls y
// el usuario completa a mano.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const direccion = req.nextUrl.searchParams.get('direccion')?.trim()
  const provincia = req.nextUrl.searchParams.get('provincia')?.trim() || null
  const localidad = req.nextUrl.searchParams.get('localidad')?.trim() || null

  if (!direccion) {
    return NextResponse.json({ barrio: null, codigoPostal: null })
  }

  try {
    const result = await geocodeStructured({
      address: direccion,
      locality: localidad,
      region: provincia,
    })
    return NextResponse.json({
      barrio: result?.neighbourhood ?? null,
      codigoPostal: result?.postalcode ?? null,
    })
  } catch (err) {
    console.warn(
      '[geo] sugerir-direccion falló:',
      err instanceof Error ? err.message : err,
    )
    return NextResponse.json({ barrio: null, codigoPostal: null })
  }
}
