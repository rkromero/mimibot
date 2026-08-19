import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { propuestas } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { canAccessLead } from '@/lib/authz'
import { toApiError, NotFoundError } from '@/lib/errors'
import { generarPropuestaPdf } from '@/lib/pdf/propuesta.service'
import { validateUuidParam } from '@/lib/api/validate-params'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    const propuesta = await db.query.propuestas.findFirst({
      where: and(eq(propuestas.id, id), isNull(propuestas.deletedAt)),
      columns: { id: true, leadId: true },
    })
    if (!propuesta) throw new NotFoundError('Propuesta')
    await canAccessLead(session.user, propuesta.leadId)

    // Lanza ConflictError (409) si la propuesta está pendiente_aprobacion
    const { buffer, filename } = await generarPropuestaPdf(id)

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
