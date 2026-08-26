export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Resend } from 'resend'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { propuestas, conversations, messages, activityLog } from '@/db/schema'
import { eq, and, isNull, sql } from 'drizzle-orm'
import { canAccessLead } from '@/lib/authz'
import { toApiError, NotFoundError, ValidationError } from '@/lib/errors'
import { generarPropuestaPdf } from '@/lib/pdf/propuesta.service'
import { formatNumeroPropuesta } from '@/lib/pdf/propuesta.template'
import { uploadMediaToMeta, sendMediaMessage } from '@/lib/whatsapp/client'
import { persistOutboundMedia } from '@/lib/whatsapp/media'
import { validateUuidParam } from '@/lib/api/validate-params'
import { programarSeguimientoPropuesta } from '@/lib/followup/engine'
import type { Session } from 'next-auth'

const enviarSchema = z.object({
  via: z.enum(['descarga', 'whatsapp', 'email'], {
    errorMap: () => ({ message: 'via debe ser descarga, whatsapp o email' }),
  }),
})

type Via = z.infer<typeof enviarSchema>['via']

// Entrega de la propuesta: por WhatsApp (documento en la conversación del
// lead), por email (Resend con el PDF adjunto) o registro de descarga manual.
// Cualquiera de las tres pasa la propuesta a 'enviada' y deja actividad.
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
      columns: { id: true, leadId: true, numero: true },
      with: { lead: { with: { contact: true } } },
    })
    if (!propuesta) throw new NotFoundError('Propuesta')
    await canAccessLead(session.user, propuesta.leadId)

    // Genera el PDF desde el snapshot congelado (409 si pendiente_aprobacion)
    const pdf = await generarPropuestaPdf(id)
    const numeroFmt = formatNumeroPropuesta(pdf.numero)

    if (parsed.data.via === 'whatsapp') {
      await enviarPorWhatsapp(propuesta.leadId, pdf.buffer, pdf.filename, numeroFmt, session.user)
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

    await marcarEnviada(id, propuesta.leadId, pdf.numero, parsed.data.via, session.user.id)

    // Seguimiento automático al día siguiente (Ajustes → Seguimiento). Best-effort.
    void programarSeguimientoPropuesta(propuesta.leadId).catch((err) => {
      console.error('[propuesta] no se pudo programar el seguimiento:', err)
    })

    return NextResponse.json({ data: { via: parsed.data.via, estado: 'enviada' } })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

async function enviarPorWhatsapp(
  leadId: string,
  buffer: Buffer,
  filename: string,
  numeroFmt: string,
  user: Session['user'],
): Promise<void> {
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.leadId, leadId),
    columns: { id: true, waContactPhone: true },
  })
  if (!conv?.waContactPhone) {
    throw new ValidationError('El lead no tiene conversación de WhatsApp para enviar la propuesta')
  }

  // Mismo flujo que el envío de adjuntos del inbox (app/api/whatsapp/send):
  // fila de mensaje + copia en R2 + upload a Meta + envío como documento
  const [msg] = await db
    .insert(messages)
    .values({
      conversationId: conv.id,
      direction: 'outbound',
      senderType: 'agent',
      senderId: user.id,
      contentType: 'document',
      body: `Propuesta ${numeroFmt}`,
      isRead: true,
      sentAt: new Date(),
    })
    .returning()

  const [, metaMediaId] = await Promise.all([
    persistOutboundMedia({
      buffer,
      messageId: msg!.id,
      conversationId: conv.id,
      mimeType: 'application/pdf',
      filename,
    }),
    uploadMediaToMeta(buffer, 'application/pdf', filename),
  ])

  const waMessageId = await sendMediaMessage(
    conv.waContactPhone,
    metaMediaId,
    'document',
    `Propuesta ${numeroFmt}`,
  )
  await db.update(messages).set({ waMessageId }).where(eq(messages.id, msg!.id))

  await db.execute(
    sql`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ${conv.id}`,
  )
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

async function marcarEnviada(
  propuestaId: string,
  leadId: string,
  numero: number,
  via: Via,
  userId: string,
): Promise<void> {
  await db
    .update(propuestas)
    .set({ estado: 'enviada', updatedAt: new Date() })
    .where(eq(propuestas.id, propuestaId))

  await db.insert(activityLog).values({
    leadId,
    userId,
    action: 'propuesta_enviada',
    metadata: { propuestaId, numero, via },
  })
}
