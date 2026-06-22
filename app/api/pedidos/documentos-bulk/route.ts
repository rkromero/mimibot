import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos } from '@/db/schema'
import { and, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { emitirDocumento } from '@/lib/pdf/pdf.service'
import { generarEtiquetaEnvio } from '@/lib/pdf/etiqueta.service'
import { mergePdfBuffers } from '@/lib/pdf/merge'
import { toApiError, ValidationError, NotFoundError } from '@/lib/errors'

export const maxDuration = 300

const bodySchema = z.object({
  tipo: z.enum(['remito', 'proforma', 'etiqueta']),
  ids: z.array(z.string().uuid()).min(1).max(100),
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const raw: unknown = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      throw new ValidationError(
        'Body inválido: se requiere "tipo" (remito|proforma|etiqueta) e "ids" (1 a 100 UUIDs)',
      )
    }
    const { tipo, ids } = parsed.data

    // Dedupe preservando el orden de selección.
    const uniqueIds = [...new Set(ids)]

    // Pre-validar que todos existan y no estén borrados (evita emitir números
    // de documento parciales si alguno no existe).
    const existentes = await db.query.pedidos.findMany({
      where: and(inArray(pedidos.id, uniqueIds), isNull(pedidos.deletedAt)),
      columns: { id: true },
    })
    const existentesSet = new Set(existentes.map((p) => p.id))
    const faltantes = uniqueIds.filter((id) => !existentesSet.has(id))
    if (faltantes.length > 0) {
      throw new NotFoundError(
        faltantes.length === uniqueIds.length
          ? 'Pedido'
          : `${faltantes.length} pedido(s) no encontrado(s) o eliminado(s)`,
      )
    }

    // Generar cada PDF en orden. Remito/proforma emiten su propio número.
    const buffers: Buffer[] = []
    for (const id of uniqueIds) {
      if (tipo === 'etiqueta') {
        buffers.push(await generarEtiquetaEnvio(id))
      } else {
        const { buffer } = await emitirDocumento(id, tipo, session.user.id)
        buffers.push(buffer)
      }
    }

    const merged = await mergePdfBuffers(buffers)
    const filename = `${tipo}s-${uniqueIds.length}-pedidos.pdf`

    return new Response(merged as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': String(merged.length),
      },
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
