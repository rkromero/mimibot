import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos, clientes } from '@/db/schema'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { r2Client, R2_BUCKET } from '@/lib/r2/client'
import { getSignedUrl } from '@/lib/r2/signed-url'
import { toApiError, AuthzError, NotFoundError, ValidationError } from '@/lib/errors'
import { getSessionContext } from '@/lib/territorios/context'
import { validateUuidParam } from '@/lib/api/validate-params'

const ESTADOS_EDITABLES = new Set(['pendiente', 'pendiente_aprobacion'])
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
])
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

type PedidoAccess = {
  id: string
  estado: string
  clienteId: string
  vendedorId: string
  comprobantePagoUrl: string | null
}

async function resolvePedidoAccess(
  pedidoId: string,
  ctx: Awaited<ReturnType<typeof getSessionContext>>,
  writeOp = false,
): Promise<PedidoAccess> {
  const pedido = await db.query.pedidos.findFirst({
    where: and(eq(pedidos.id, pedidoId), isNull(pedidos.deletedAt)),
    columns: { id: true, estado: true, clienteId: true, vendedorId: true, comprobantePagoUrl: true },
  })
  if (!pedido) throw new NotFoundError('Pedido')

  if (ctx.role === 'admin') return pedido

  if (ctx.role === 'agent') {
    const cliente = await db.query.clientes.findFirst({
      where: and(eq(clientes.id, pedido.clienteId), eq(clientes.asignadoA, ctx.userId)),
      columns: { id: true },
    })
    if (!cliente) throw new AuthzError('No tenés acceso a este pedido')
    return pedido
  }

  // Gerente: read-only access to see comprobante when approving
  if (ctx.role === 'gerente' && !writeOp) {
    if (ctx.territoriosGestionados.length === 0) throw new AuthzError('No tenés acceso a este pedido')
    const cliente = await db.query.clientes.findFirst({
      where: and(
        eq(clientes.id, pedido.clienteId),
        inArray(clientes.territorioId, ctx.territoriosGestionados),
      ),
      columns: { id: true },
    })
    if (!cliente) throw new AuthzError('No tenés acceso a este pedido')
    return pedido
  }

  throw new AuthzError('No tenés acceso a este recurso')
}

// GET: returns signed URL for the payment comprobante
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

    const ctx = await getSessionContext(session.user)

    if (ctx.role === 'vendedor') {
      throw new AuthzError('El vendedor no tiene acceso al comprobante de pago')
    }

    const pedido = await resolvePedidoAccess(id, ctx, false)

    if (!pedido.comprobantePagoUrl) {
      return NextResponse.json({ url: null, missingComprobante: true })
    }

    const sanitized = pedido.comprobantePagoUrl.replace(/\.\./g, '').replace(/^\/+/, '')
    const url = await getSignedUrl(sanitized)
    return NextResponse.json({ url, missingComprobante: false })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

// POST: upload payment comprobante to R2 and persist key
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const ctx = await getSessionContext(session.user)

    if (ctx.role !== 'agent' && ctx.role !== 'admin') {
      throw new AuthzError('Solo agentes y administradores pueden adjuntar comprobantes de pago')
    }

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    const pedido = await resolvePedidoAccess(id, ctx, true)

    if (ctx.role !== 'admin' && !ESTADOS_EDITABLES.has(pedido.estado)) {
      throw new ValidationError(
        'Solo se puede adjuntar comprobante mientras el pedido está pendiente o pendiente de aprobación',
      )
    }

    const missingVars = (
      ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const
    ).filter((v) => !process.env[v])
    if (missingVars.length > 0) {
      return NextResponse.json(
        { error: `Almacenamiento no configurado — variables faltantes: ${missingVars.join(', ')}` },
        { status: 503 },
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    if (file.size === 0) return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 })
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'El archivo supera el límite de 10 MB' }, { status: 400 })
    }

    const mimeType = file.type
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido. Solo se aceptan imágenes (JPG, PNG, WEBP, GIF) y PDF.' },
        { status: 400 },
      )
    }

    const ext = mimeType === 'application/pdf' ? 'pdf' : (mimeType.split('/')[1] ?? 'bin')
    const rand = Math.random().toString(36).slice(2, 8)
    const key = `comprobantes-pago/${Date.now()}-${rand}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    )

    await db
      .update(pedidos)
      .set({ comprobantePagoUrl: key, updatedAt: new Date() })
      .where(eq(pedidos.id, id))

    return NextResponse.json({ r2Key: key })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

// DELETE: remove payment comprobante (set to null)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const ctx = await getSessionContext(session.user)

    if (ctx.role !== 'agent' && ctx.role !== 'admin') {
      throw new AuthzError('Solo agentes y administradores pueden eliminar comprobantes de pago')
    }

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    const pedido = await resolvePedidoAccess(id, ctx, true)

    if (ctx.role !== 'admin' && !ESTADOS_EDITABLES.has(pedido.estado)) {
      throw new ValidationError('No se puede quitar el comprobante de un pedido ya confirmado')
    }

    await db
      .update(pedidos)
      .set({ comprobantePagoUrl: null, updatedAt: new Date() })
      .where(eq(pedidos.id, id))

    return NextResponse.json({ success: true })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
