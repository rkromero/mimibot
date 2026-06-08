// Server-only — never import from client components.
// MP_ACCESS_TOKEN must be set in Railway environment variables.

const MP_BASE = 'https://api.mercadopago.com'

function getAccessToken(): string {
  const token = process.env['MP_ACCESS_TOKEN']
  if (!token) {
    throw new Error(
      '[MercadoPago] MP_ACCESS_TOKEN no está configurado. ' +
      'Configurá esta variable de entorno en Railway antes de usar cobro QR.',
    )
  }
  return token
}

async function mpFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${MP_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAccessToken()}`,
      ...(options.headers as Record<string, string>),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`[MercadoPago] ${res.status} ${path}: ${body}`)
  }
  return res.json() as Promise<T>
}

export interface MpPreferenceItem {
  title: string
  quantity: number
  unit_price: number
  currency_id?: string
}

export interface MpPreferenceResult {
  id: string
  init_point: string
  sandbox_init_point: string
}

export async function createPreference(opts: {
  items: MpPreferenceItem[]
  externalReference: string
  notificationUrl: string
}): Promise<MpPreferenceResult> {
  return mpFetch<MpPreferenceResult>('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: opts.items.map((i) => ({ currency_id: 'ARS', ...i })),
      external_reference: opts.externalReference,
      notification_url: opts.notificationUrl,
      // Sin auto_return / back_urls: el cobro por QR no usa redirección;
      // la confirmación del pago llega por el webhook. auto_return exigiría
      // back_urls.success y haría que MP rechace la preferencia (400).
    }),
  })
}

export interface MpPayment {
  id: number
  status: string
  status_detail: string
  external_reference: string | null
  transaction_amount: number
  currency_id: string
}

export async function getPayment(paymentId: string | number): Promise<MpPayment> {
  return mpFetch<MpPayment>(`/v1/payments/${paymentId}`)
}

export interface MpPaymentSearchItem {
  id: number
  status: string
  transaction_amount: number
  external_reference: string
}

export async function searchApprovedPaymentByExternalRef(
  externalRef: string,
): Promise<MpPaymentSearchItem | null> {
  interface SearchResponse {
    results: MpPaymentSearchItem[]
  }
  const data = await mpFetch<SearchResponse>(
    `/v1/payments/search?external_reference=${encodeURIComponent(externalRef)}&sort=date_created&criteria=desc`,
  )
  return data.results.find((p) => p.status === 'approved') ?? null
}
