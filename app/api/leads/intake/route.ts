import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { leads, contacts, pipelineStages, activityLog, tags, leadTags } from '@/db/schema'
import { eq, and, asc, desc, isNull } from 'drizzle-orm'
import { asegurarConversacionLead } from '@/lib/inbox/conversacion-lead'
import { intakeSchema, normalizeIntake, buildIntakeResumen } from '@/lib/validations/lead'
import { toApiError } from '@/lib/errors'
import { sendTextMessage } from '@/lib/whatsapp/client'
import { normalizePhone } from '@/lib/whatsapp/messages'
import { publishCrmEvent } from '@/lib/realtime/broker'

const ALLOWED_ORIGINS = (process.env['ALLOWED_ORIGINS'] ?? '').split(',').filter(Boolean)

// Endpoint público de captación: acá no viajan cookies ni credenciales, así
// que sin allowlist configurada se refleja el origen del request. Si se setea
// ALLOWED_ORIGINS, solo esos orígenes pueden leer la respuesta.
function corsHeaders(origin: string | null) {
  const abierto = ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes('*')
  const allowed = abierto
    ? origin ?? '*'
    : origin && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0]!

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

// Colores fijos para los tags de origen conocidos; cualquier otro cae en gris.
const TAG_COLORS: Record<string, string> = {
  'web-alipro': '#C8102E',
  'landing-alfajores': '#ea580c',
  'landing-cda': '#2563eb',
}

async function ensureTag(nombre: string): Promise<string> {
  const existing = await db.query.tags.findFirst({ where: eq(tags.name, nombre) })
  if (existing) return existing.id

  const [created] = await db
    .insert(tags)
    .values({ name: nombre, color: TAG_COLORS[nombre] ?? '#6b7280' })
    .onConflictDoNothing({ target: tags.name })
    .returning({ id: tags.id })
  if (created) return created.id

  // carrera: otro request lo creó entre el select y el insert
  const raced = await db.query.tags.findFirst({ where: eq(tags.name, nombre) })
  return raced!.id
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  try {
    // req.json() parsea el body aunque llegue como text/plain: las landings lo
    // mandan así a propósito para evitar el preflight de CORS.
    const body: unknown = await req.json()
    const parsed = intakeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400, headers })
    }

    const data = normalizeIntake(parsed.data)
    // Mismo formato E.164 (+54...) que usa el webhook de WhatsApp: si después
    // escribe por WhatsApp, el mensaje cae en la misma conversación.
    const phone = data.phone && normalizePhone(data.phone) ? `+${normalizePhone(data.phone)}` : null
    const resumen = buildIntakeResumen(data)

    // Buscar o crear contacto (por teléfono normalizado)
    let contactId: string
    const existing = phone
      ? await db.query.contacts.findFirst({ where: eq(contacts.phone, phone) })
      : null

    if (existing) {
      contactId = existing.id
      if (!existing.email && data.email) {
        await db.update(contacts).set({ email: data.email, updatedAt: new Date() }).where(eq(contacts.id, existing.id))
      }
    } else {
      const [c] = await db
        .insert(contacts)
        .values({ name: data.name, phone, email: data.email })
        .returning({ id: contacts.id })
      contactId = c!.id
    }

    // Si el contacto ya tiene un lead abierto se reutiliza: reenviar el
    // formulario no genera leads duplicados, suma el mensaje a la conversación.
    const openLead = await db.query.leads.findFirst({
      where: and(eq(leads.contactId, contactId), eq(leads.isOpen, true), isNull(leads.deletedAt)),
      orderBy: [desc(leads.createdAt)],
    })

    let leadId: string
    let stageIdLead: string
    if (openLead) {
      leadId = openLead.id
      stageIdLead = openLead.stageId
      await db.update(leads)
        .set({
          notes: openLead.notes ? `${openLead.notes}\n\n---\n${resumen}` : resumen,
          productInterest: openLead.productInterest ?? data.producto,
          direccion: openLead.direccion ?? data.direccion,
          localidad: openLead.localidad ?? data.localidad,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId))
      await db.insert(activityLog).values({
        leadId,
        action: 'note_added',
        metadata: { source: data.source, fromIntake: true },
      })
    } else {
      const firstStage = await db.query.pipelineStages.findFirst({
        where: eq(pipelineStages.slug, 'nuevo'),
      }) ?? await db.query.pipelineStages.findFirst({
        orderBy: [asc(pipelineStages.position)],
      })

      if (!firstStage) {
        return NextResponse.json({ error: 'Pipeline no configurado' }, { status: 503, headers })
      }

      const custom: Record<string, unknown> = { ...data.extras }
      if (data.empresa) custom['empresa'] = data.empresa

      const [lead] = await db
        .insert(leads)
        .values({
          contactId,
          stageId: firstStage.id,
          source: 'landing',
          productInterest: data.producto,
          direccion: data.direccion,
          localidad: data.localidad,
          notes: resumen,
          customFields: custom,
          botEnabled: true,
        })
        .returning({ id: leads.id })
      leadId = lead!.id
      stageIdLead = firstStage.id

      await db.insert(activityLog).values({
        leadId,
        action: 'lead_created',
        metadata: { source: data.source, fromIntake: true },
      })
    }

    // Tag con la landing de origen, visible en inbox y pipeline
    const tagId = await ensureTag(data.source)
    await db.insert(leadTags).values({ leadId, tagId }).onConflictDoNothing()

    // Conversación de WhatsApp lista para escribir, pero SIN mensajes: el lead
    // no entra al inbox hasta que el vendedor le escriba o la persona escriba
    // por WhatsApp. El resumen del formulario ya queda en las notas del lead.
    if (phone) {
      await asegurarConversacionLead(leadId, phone)

      const now = new Date()
      await db.update(leads)
        .set({ lastContactedAt: now, updatedAt: now })
        .where(eq(leads.id, leadId))

      const welcomeMsg = process.env['WA_WELCOME_MESSAGE']
      if (welcomeMsg) {
        void sendTextMessage(normalizePhone(phone), welcomeMsg).catch(() => {})
      }
    }

    // Refrescar el kanban en tiempo real (antes lo hacía el evento new_message)
    await publishCrmEvent({
      type: 'lead_updated',
      leadId,
      assignedTo: openLead?.assignedTo ?? null,
      oldAssigned: openLead?.assignedTo ?? null,
      stageId: stageIdLead,
      oldStageId: stageIdLead,
    })

    return NextResponse.json({ ok: true, leadId }, { status: 201, headers })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status, headers })
  }
}
