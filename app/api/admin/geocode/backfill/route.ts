import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { clientes } from '@/db/schema'
import { and, isNull, isNotNull, or } from 'drizzle-orm'
import { toApiError } from '@/lib/errors'
import { withAdminAuth } from '@/lib/authz'
import { geocodeClienteIfNeeded } from '@/lib/geo/geocode.service'
import { esRegionCABA, resolverRegion, puntoCaeEnRegion } from '@/lib/geo/ors'

export const maxDuration = 300

// Rate limit: ~1 request a ORS cada 1.5s.
const RATE_LIMIT_MS = 1500
// Cortamos un poco antes del maxDuration (300s) para alcanzar a devolver el reporte
// en vez de que la función se corte sin respuesta. Lo que quede sin procesar se
// reporta y se puede continuar con otra llamada.
const TIME_BUDGET_MS = 280_000

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

type Body = {
  force?: boolean
  soloRegionCABA?: boolean
  soloFueraDeProvincia?: boolean
}

/**
 * Re-geocodifica una lista de clientes (por id) respetando el rate-limit y un
 * presupuesto de tiempo. Devuelve cuántos quedaron OK (corregidos) vs failed.
 */
async function reGeocodificarIds(ids: string[], inicio: number) {
  let procesados = 0
  let exitosos = 0
  let fallidos = 0
  let errores = 0
  let detenidoPorTiempo = false

  for (const [i, id] of ids.entries()) {
    if (Date.now() - inicio > TIME_BUDGET_MS) {
      detenidoPorTiempo = true
      break
    }
    try {
      const resultado = await geocodeClienteIfNeeded(id, { force: true })
      if (resultado === 'ok') exitosos++
      else fallidos++ // 'failed' (queda lat/lng=null y navega por dirección)
    } catch (e) {
      console.error(`[backfill] error cliente ${id}:`, e instanceof Error ? e.message : e)
      errores++
    }
    procesados++

    // Rate limit: ~1 req/1.5s — sin delay tras el último item
    if (i < ids.length - 1) await sleep(RATE_LIMIT_MS)
  }

  return { total: ids.length, procesados, exitosos, fallidos, errores, detenidoPorTiempo }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    const body = (await req.json().catch(() => ({}))) as Body
    const force = body.force === true
    const soloRegionCABA = body.soloRegionCABA === true
    const soloFueraDeProvincia = body.soloFueraDeProvincia === true

    return await withAdminAuth(async () => {
      const inicio = Date.now()

      // ── Modo: SOLO clientes que declaran CABA ────────────────────────────────
      // Re-geocodifica acotadamente los clientes de CABA (provincia o localidad
      // alias de CABA), que son los afectados por el bug histórico (resueltos en
      // otra provincia). El resto de la base no se toca.
      if (soloRegionCABA) {
        const candidatos = await db.query.clientes.findMany({
          where: and(isNull(clientes.deletedAt), isNotNull(clientes.direccion)),
          columns: { id: true, provincia: true, localidad: true },
        })
        const ids = candidatos
          .filter((c) => esRegionCABA(c.provincia, c.localidad))
          .map((c) => c.id)

        const r = await reGeocodificarIds(ids, inicio)
        return NextResponse.json({ modo: 'soloRegionCABA', ...r })
      }

      // ── Modo: SOLO clientes cuyas coordenadas caen fuera de su provincia ─────
      // Reverse-geocodifica las coordenadas actuales y, si no caen en la provincia
      // declarada (validando properties.region como en Fase 1), re-geocodifica.
      if (soloFueraDeProvincia) {
        const candidatos = await db.query.clientes.findMany({
          where: and(
            isNull(clientes.deletedAt),
            isNotNull(clientes.direccion),
            isNotNull(clientes.lat),
            isNotNull(clientes.lng),
          ),
          columns: { id: true, provincia: true, localidad: true, lat: true, lng: true },
        })

        let evaluados = 0
        let fueraDeProvincia = 0
        let exitosos = 0
        let fallidos = 0
        let errores = 0
        let sinRegionDeclarada = 0
        let noDeterminado = 0
        let detenidoPorTiempo = false

        for (const c of candidatos) {
          if (c.lat == null || c.lng == null) continue
          // Sin provincia/localidad resoluble no hay contra qué validar: no tocamos.
          const expectedRegion = resolverRegion(c.provincia, c.localidad)
          if (!expectedRegion) {
            sinRegionDeclarada++
            continue
          }

          if (Date.now() - inicio > TIME_BUDGET_MS) {
            detenidoPorTiempo = true
            break
          }

          let enRegion: boolean | null = null
          try {
            enRegion = await puntoCaeEnRegion(c.lat, c.lng, expectedRegion)
          } catch (e) {
            console.error(`[backfill] reverse error cliente ${c.id}:`, e instanceof Error ? e.message : e)
            errores++
          }
          await sleep(RATE_LIMIT_MS)
          evaluados++

          // No se pudo decidir o ya cae bien → no tocamos al cliente.
          if (enRegion === null || enRegion === true) continue

          // Coordenadas fuera de la provincia declarada → re-geocodificar.
          fueraDeProvincia++
          if (Date.now() - inicio > TIME_BUDGET_MS) {
            detenidoPorTiempo = true
            break
          }
          try {
            const resultado = await geocodeClienteIfNeeded(c.id, { force: true })
            if (resultado === 'ok') exitosos++
            else fallidos++
          } catch (e) {
            console.error(`[backfill] error cliente ${c.id}:`, e instanceof Error ? e.message : e)
            errores++
          }
          await sleep(RATE_LIMIT_MS)
        }

        return NextResponse.json({
          modo: 'soloFueraDeProvincia',
          total: candidatos.length,
          evaluados,
          fueraDeProvincia,
          procesados: fueraDeProvincia,
          exitosos,
          fallidos,
          errores,
          sinRegionDeclarada,
          noDeterminado,
          detenidoPorTiempo,
        })
      }

      // ── Modo por defecto: backfill (force = todos / sin force = solo pendientes) ─
      const where = force
        ? and(isNull(clientes.deletedAt), isNotNull(clientes.direccion))
        : and(
            isNull(clientes.deletedAt),
            isNotNull(clientes.direccion),
            or(isNull(clientes.lat), isNull(clientes.lng)),
          )

      const pendientes = await db.query.clientes.findMany({
        where,
        columns: { id: true },
      })

      let procesados = 0
      let exitosos = 0
      let fallidos = 0
      let errores = 0
      let detenidoPorTiempo = false

      for (const [i, pendiente] of pendientes.entries()) {
        if (Date.now() - inicio > TIME_BUDGET_MS) {
          detenidoPorTiempo = true
          break
        }
        try {
          const resultado = await geocodeClienteIfNeeded(pendiente.id, { force })
          if (resultado === 'failed') fallidos++
          else exitosos++ // 'ok' o 'skipped' (sin force, los ya geocodificados se saltean)
        } catch (e) {
          console.error(`[backfill] error cliente ${pendiente.id}:`, e instanceof Error ? e.message : e)
          errores++
        }
        procesados++

        // Rate limit: ~1 req/1.5s — sin delay tras el último item
        if (i < pendientes.length - 1) await sleep(RATE_LIMIT_MS)
      }

      return NextResponse.json({ procesados, exitosos, fallidos, errores, force, detenidoPorTiempo })
    }, session?.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
