import { NextRequest, NextResponse } from 'next/server'
import { getPayment } from '@/lib/mercadopago/client'
import { confirmarPagoPedido } from '@/lib/mercadopago/confirmar-pago'

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
    const topic = searchParams.get('topic')
    // Accepts both regular webhooks (?type=payment) and IPN (?topic=payment&id=...)
    const isPaymentNotification = type === 'payment' || topic === 'payment'
    const dataId = searchParams.get('data.id') ?? searchParams.get('id') ?? ''

    if (!isPaymentNotification || !dataId) {
      return NextResponse.json({ ok: true })
    }

    const valid = await validateSignature(req, dataId)
    if (!valid) {
      console.error('[mp-webhook] Invalid signature for data.id:', dataId)
      return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
    }

    const payment = await getPayment(dataId)

    if (payment.status !== 'approved') {
      return NextResponse.json({ ok: true })
    }

    await confirmarPagoPedido(payment)

    return NextResponse.json({ ok: true })
  } catch (err) {
    // Always respond 200 to MP so it doesn't retry indefinitely
    console.error('[mp-webhook] Error processing webhook:', err)
    return NextResponse.json({ ok: true })
  }
}
