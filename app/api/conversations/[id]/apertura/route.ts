import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { toApiError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'
import { estaDentroDe24h } from '@/lib/whatsapp/ventana'
import { listarPlantillasApertura, resolverConversacionParaEnvio } from '@/lib/whatsapp/apertura'

/**
 * Estado de la ventana de 24 hs de una conversación y las plantillas aprobadas
 * con las que se puede abrir/retomar, ya resueltas para ese contacto.
 * Lo usa el composer del chat para mostrar la vista previa y el botón de envío.
 */
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

    const { contactName, productoInteres } = await resolverConversacionParaEnvio(session.user, id)
    const ventanaAbierta = await estaDentroDe24h(id)

    const plantillas = ventanaAbierta
      ? []
      : await listarPlantillasApertura({
          clienteNombre: contactName,
          vendedorNombre: session.user.name ?? undefined,
          productoInteres: productoInteres ?? undefined,
        })

    return NextResponse.json({ data: { ventanaAbierta, plantillas } })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
