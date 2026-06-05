import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { clientes } from '@/db/schema'
import { and, isNull, isNotNull, or } from 'drizzle-orm'
import { toApiError } from '@/lib/errors'
import { withAdminAuth } from '@/lib/authz'
import { geocodeClienteIfNeeded } from '@/lib/geo/geocode.service'

export const maxDuration = 300

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export async function POST() {
  try {
    const session = await auth()

    return await withAdminAuth(async () => {
      const pendientes = await db.query.clientes.findMany({
        where: and(
          isNull(clientes.deletedAt),
          isNotNull(clientes.direccion),
          or(isNull(clientes.lat), isNull(clientes.lng)),
        ),
        columns: { id: true, direccion: true },
      })

      let procesados = 0
      let exitosos = 0
      let fallidos = 0

      for (const cliente of pendientes) {
        try {
          await geocodeClienteIfNeeded(cliente.id, { force: false })
          exitosos++
        } catch (e) {
          console.error(`[backfill] error cliente ${cliente.id}:`, e instanceof Error ? e.message : e)
          fallidos++
        }
        procesados++

        // Rate limit: ~1 req/1.5s — skip delay after last item
        if (procesados < pendientes.length) {
          await sleep(1500)
        }
      }

      return NextResponse.json({ procesados, exitosos, fallidos })
    }, session?.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
