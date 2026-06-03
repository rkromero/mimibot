import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { generarEtiquetaEnvio } from '@/lib/pdf/etiqueta.service'
import { toApiError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'

export async function GET(
  _req: NextRequest,
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

    const buffer = await generarEtiquetaEnvio(id)
    const filename = `etiqueta-${id.slice(-8).toUpperCase()}.pdf`

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
