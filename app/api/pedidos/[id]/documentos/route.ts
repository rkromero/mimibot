import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { emitirDocumento } from '@/lib/pdf/pdf.service'
import { toApiError, ValidationError } from '@/lib/errors'

const TIPOS_VALIDOS = ['remito', 'proforma'] as const
type TipoDocumento = (typeof TIPOS_VALIDOS)[number]

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params

    const body: unknown = await req.json()
    const tipo = (body as Record<string, unknown>)?.tipo

    if (!tipo || !TIPOS_VALIDOS.includes(tipo as TipoDocumento)) {
      throw new ValidationError('El campo "tipo" debe ser "remito" o "proforma"')
    }

    const { buffer, numero } = await emitirDocumento(
      id,
      tipo as TipoDocumento,
      session.user.id,
    )

    const filename = `${tipo as string}-${String(numero).padStart(6, '0')}.pdf`

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
