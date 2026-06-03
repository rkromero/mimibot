import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { pedidos, users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getPayment } from '@/lib/mercadopago/client'
import { registrarPagoPedido } from '@/lib/cuenta-corriente/pago.service'

// ── Signature validation ──────────────────────────────────────────────────────
// MP signs webhooks with HMAC-SHA256 over: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
// The signature arrives in the x-signature header as "ts=<ts>,v1=<hex>"

async function validateSignature(req: NextRequest, dataId: string): Promise<boolean> {
  const secret = process.env['MP_WEBHOOK_SECRET']
  if (!secret) {
    console.warn('[mp-webhook] MP_WEBHOOK_SECRET not configured — skipping signature check')
    return true
  }

  const xSignature = req.headers.get('x-signature') ?? ''
  const xRequestId = req.headers.get('x-request-id') ?? ''

  const parts: Record<string, string> = {}
  for (const part of xSignature.split(',')) {
    const [k, v] = part.split('=')
    if (k && v) parts[k.trim()] = v.trim()
  }
  const ts = parts['ts'] ?? ''
  const v1 = parts['v1'] ?? ''
  if (!ts || !v1) return false

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(manifest))
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return computed === v1
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const type = searchParams.get('type')
    const dataId = searchParams.get('data.id') ?? searchParams.get('id') ?? ''

    // We only care about payment notifications
    if (type !== 'payment' || !dataId) {
      return NextResponse.json({ ok: true })
    }

    const valid = await validateSignature(req, dataId)
    if (!valid) {
      console.error('[mp-webhook] Invalid signature for data.id:', dataId)
      return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
    }

    // Fetch payment details from MP API
    const payment = await getPayment(dataId)

    if (payment.status !== 'approved') {
      // Not yet approved — nothing to do, acknowledge
      return NextResponse.json({ ok: true })
    }

    const pedidoId = payment.external_reference
    if (!pedidoId) {
      console.warn('[mp-webhook] Payment', payment.id, 'has no external_reference')
      return NextResponse.json({ ok: true })
    }

    // Idempotency: skip if this payment was already recorded
    const pedido = await db.query.pedidos.findFirst({
      where: eq(pedidos.id, pedidoId),
      columns: { id: true, mpPaymentId: true, entregadoPor: true, saldoPendiente: true },
    })

    if (!pedido) {
      console.warn('[mp-webhook] Pedido not found:', pedidoId)
      return NextResponse.json({ ok: true })
    }

    if (pedido.mpPaymentId === String(payment.id)) {
      // Already processed — idempotent response
      return NextResponse.json({ ok: true })
    }

    // Resolve registradoPor: use the repartidor who delivered, or fall back to any admin
    let registradoPor = pedido.entregadoPor
    if (!registradoPor) {
      const admin = await db.query.users.findFirst({
        where: eq(users.role, 'admin'),
        columns: { id: true },
      })
      if (!admin) {
        console.error('[mp-webhook] Cannot register payment: no valid registradoPor for pedido', pedidoId)
        return NextResponse.json({ ok: true })
      }
      registradoPor = admin.id
    }

    // Register the payment
    const monto = payment.transaction_amount.toFixed(2)
    await registrarPagoPedido({
      pedidoId,
      monto,
      metodoPago: 'mercadopago',
      registradoPor,
    })

    // Save mp_payment_id for idempotency
    await db
      .update(pedidos)
      .set({ mpPaymentId: String(payment.id), updatedAt: new Date() })
      .where(eq(pedidos.id, pedidoId))

    console.info('[mp-webhook] Payment', payment.id, 'applied to pedido', pedidoId, '— monto', monto)
    return NextResponse.json({ ok: true })
  } catch (err) {
    // Always respond 200 to MP so it doesn't retry indefinitely
    console.error('[mp-webhook] Error processing webhook:', err)
    return NextResponse.json({ ok: true })
  }
}
