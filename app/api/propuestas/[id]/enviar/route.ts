export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Resend } from 'resend'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { propuestas } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { canAccessLead } from '@/lib/authz'
import { toApiError, NotFoundError, ValidationError } from '@/lib/errors'
import { generarPropuestaPdf } from '@/lib/pdf/propuesta.service'
import { formatNumeroPropuesta } from '@/lib/pdf/propuesta.template'
import { validateUuidParam } from '@/lib/api/validate-params'
import { enviarPropuestaPorWhatsapp, registrarEnvioPropuesta } from '@/lib/cotizador/enviar-propuesta.service'

const enviarSchema = z.object({
  via: z.enum(['descarga', 'whatsapp', 'email'], {
    errorMap: () => ({ message: 'via debe ser descarga, whatsapp o email' }),
  }),
})

// Entrega de la propuesta: por WhatsApp (documento en la conversación del
// lead), por email (Resend con el PDF adjunto) o registro de descarga manual.
// Cualquiera de las tres pasa la propuesta a 'enviada', deja actividad y
// mueve el lead a la etapa "Propuesta enviada" (lib/cotizador/enviar-propuesta.service.ts).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    const body: unknown = await req.json()
    const parsed = enviarSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const propuesta = await db.query.propuestas.findFirst({
      where: and(eq(propuestas.id, id), isNull(propuestas.deletedAt)),
      columns: { id: true, leadId: true, numero: true, estado: true },
      with: { lead: { with: { contact: true } } },
    })
    if (!propuesta) throw new NotFoundError('Propuesta')
    await canAccessLead(session.user, propuesta.leadId)

    // Genera el PDF desde el snapshot congelado (409 si pendiente_aprobacion)
    const pdf = await generarPropuestaPdf(id)
    const numeroFmt = formatNumeroPropuesta(pdf.numero)

    if (parsed.data.via === 'whatsapp') {
      await enviarPropuestaPorWhatsapp(propuesta.leadId, pdf.buffer, pdf.filename, numeroFmt, {
        senderType: 'agent',
        senderId: session.user.id,
      })
    } else if (parsed.data.via === 'email') {
      await enviarPorEmail(
        propuesta.lead.contact.email,
        propuesta.lead.contact.name,
        pdf.buffer,
        pdf.filename,
        numeroFmt,
      )
    }
    // 'descarga': el PDF ya lo bajó el navegador vía GET /pdf; acá solo se registra

    // Volver a bajar el PDF de una propuesta que ya salió no es un envío nuevo:
    // se registra, pero no mueve de etapa ni vuelve a programar el seguimiento.
    const { etapaMovida } = await registrarEnvioPropuesta({
      propuestaId: id,
      leadId: propuesta.leadId,
      numero: pdf.numero,
      via: parsed.data.via,
      userId: session.user.id,
      yaEstabaEnviada: propuesta.estado === 'enviada',
    })

    return NextResponse.json({ data: { via: parsed.data.via, estado: 'enviada', etapaMovida } })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

async function enviarPorEmail(
  email: string | null,
  nombreContacto: string,
  buffer: Buffer,
  filename: string,
  numeroFmt: string,
): Promise<void> {
  if (!email) {
    throw new ValidationError('El lead no tiene email cargado para enviar la propuesta')
  }
  if (!process.env['RESEND_API_KEY']) {
    throw new ValidationError('RESEND_API_KEY no está configurada')
  }

  const resend = new Resend(process.env['RESEND_API_KEY'])
  const { error } = await resend.emails.send({
    from: process.env['RESEND_FROM_EMAIL'] ?? 'CRM ALIPRO <noreply@mimi.com.ar>',
    to: email,
    subject: `Propuesta ${numeroFmt} — ALIPRO`,
    text: [
      `Hola ${nombreContacto},`,
      '',
      `Te acercamos la propuesta ${numeroFmt} de producción de alfajores a fasón. El detalle está en el PDF adjunto.`,
      '',
      'Quedamos a disposición por cualquier consulta.',
      '',
      'ALIPRO',
    ].join('\n'),
    attachments: [{ filename, content: buffer }],
  })
  if (error) {
    throw new ValidationError(`No se pudo enviar el email: ${error.message}`)
  }
}
