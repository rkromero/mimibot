import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { leads, contacts, conversations, pipelineStages, activityLog } from '@/db/schema'
import { eq, asc } from 'drizzle-orm'
import { intakeSchema } from '@/lib/validations/lead'
import { toApiError } from '@/lib/errors'
import { assignNextAgent } from '@/lib/assignment'
import { sendTextMessage } from '@/lib/whatsapp/client'

const ALLOWED_ORIGINS = (process.env['ALLOWED_ORIGINS'] ?? '').split(',').filter(Boolean)

function corsHeaders(origin: string | null) {
  const allowed =
    origin && (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*'))
      ? origin
      : ALLOWED_ORIGINS[0] ?? ''

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin')
  return new Response(null, { status: 204, headers: corsHeaders(origin) })
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  try {
    const body: unknown = await req.json()
    const parsed = intakeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400, headers })
    }

    const { name, email, phone, message, source } = parsed.data

    // Buscar o crear contacto
    let contactId: string
    const existing = phone
      ? await db.query.contacts.findFirst({ where: eq(contacts.phone, phone) })
      : null

    if (existing) {
      contactId = existing.id
    } else {
      const [c] = await db
        .insert(contacts)
        .values({ name, phone: phone ?? null, email: email ?? null })
        .returning({ id: contacts.id })
      contactId = c!.id
    }

    // Obtener la primera etapa del pipeline
    const firstStage = await db.query.pipelineStages.findFirst({
      where: eq(pipelineStages.slug, 'nuevo'),
    }) ?? await db.query.pipelineStages.findFirst({
      orderBy: [asc(pipelineStages.position)],
    })

    if (!firstStage) {
      return NextResponse.json({ error: 'Pipeline no configurado' }, { status: 503, headers })
    }

    const assignedTo = await assignNextAgent()

    const [lead] = await db
      .insert(leads)
      .values({
        contactId,
        stageId: firstStage.id,
        source: 'landing',
        notes: message ?? null,
        botEnabled: true,
        assignedTo,
      })
      .returning()

    await db.insert(activityLog).values({
      leadId: lead!.id,
      action: 'lead_created',
      metadata: { source: source ?? 'landing', fromIntake: true },
    })

    // Crear conversación si tiene teléfono y disparar bienvenida
    if (phone) {
      await db.insert(conversations).values({
        leadId: lead!.id,
        waContactPhone: phone,
        waPhoneNumberId: process.env['WA_PHONE_NUMBER_ID'] ?? null,
      })

      const welcomeMsg = process.env['WA_WELCOME_MESSAGE']
      if (welcomeMsg) {
        void sendTextMessage(phone, welcomeMsg).catch(() => {})
      }
    }

    return NextResponse.json({ ok: true, leadId: lead!.id }, { status: 201, headers })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status, headers })
  }
}
