import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { emitirDocumento } from '@/lib/pdf/pdf.service'
import { toApiError, ValidationError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'

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
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    const body: unknown = await req.json()
    const tipo = (body as Record<string, unknown>)?.tipo

    if (!tipo || !TIPOS_VALIDOS.includes(tipo as TipoDocumento)) {
      throw new ValidationError('El campo "tipo" debe ser "remito" o "proforma"')
    }

    const { buffer, nombreArchivo } = await emitirDocumento(
      id,
      tipo as TipoDocumento,
      session.user.id,
    )

    // La proforma se descarga (se la manda al cliente); el remito se imprime.
    // El nombre lleva cliente + número de pedido: "Juan Perez - Pedido 3A9F12BC - Proforma.pdf".
    const disposition = tipo === 'proforma' ? 'attachment' : 'inline'

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${nombreArchivo}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
