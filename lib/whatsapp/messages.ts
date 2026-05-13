/**
 * Helpers para armar mensajes pre-formateados de WhatsApp y normalizar
 * teléfonos para el formato que espera wa.me (Meta).
 *
 * Reglas de estilo acordadas con el usuario:
 *   1. Tuteo profesional (vos, te, escribime)
 *   2. Firma "— <nombre del vendedor>, Mimi Alfajores"
 *   3. Sin emojis
 *   4. Sin datos de empresa al pie
 *   5. Un mensaje específico por tipo de acción (pedido, cobro, recordatorio, reenvío)
 *
 * Cada builder devuelve un string plano; quien lo use es responsable de
 * envolverlo con `encodeURIComponent` antes de meterlo en la URL.
 */

import { format } from 'date-fns'

const COMPANY_NAME = 'Mimi Alfajores'

// ─── Phone normalization ─────────────────────────────────────────────────────

/**
 * Convierte un string libre de teléfono en una secuencia de dígitos lista para
 * `https://wa.me/<digits>`. Asume Argentina si no hay código de país.
 *
 * Reglas:
 *   - Saca todo lo que no sea dígito.
 *   - Si ya empieza con `54`, lo deja como está.
 *   - Si arranca con `0` (formato local), lo saca y agrega `54`.
 *   - En cualquier otro caso, antepone `54`.
 *
 * No agrega el "9" extra para móviles porque la implementación previa de la
 * app no lo hacía y queremos que todos los botones se comporten igual; si en
 * el futuro decidimos forzar el `549...`, se cambia acá una sola vez.
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = String(raw).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('54')) return digits
  return '54' + digits.replace(/^0/, '')
}

/**
 * Construye la URL completa de wa.me con el mensaje codificado.
 * Devuelve `null` si el teléfono normalizado queda vacío.
 */
export function buildWhatsappLink(rawPhone: string | null | undefined, message: string): string | null {
  const phone = normalizePhone(rawPhone)
  if (!phone) return null
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function money(value: string | number | null | undefined): string {
  const num = typeof value === 'number' ? value : parseFloat(String(value ?? '0'))
  if (Number.isNaN(num)) return '$0'
  return `$${num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function shortDate(iso: string | Date | null | undefined): string {
  if (!iso) return ''
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return ''
  return format(d, 'dd/MM')
}

function firstName(full: string | null | undefined): string {
  if (!full) return ''
  return full.trim().split(/\s+/)[0] ?? ''
}

function signature(vendedorName: string | null | undefined): string {
  const v = (vendedorName ?? '').trim()
  if (!v) return `— ${COMPANY_NAME}`
  // Si el vendedor tiene nombre y apellido, dejamos solo el primer nombre para
  // que la firma quede informal pero profesional ("— Nico, Mimi Alfajores").
  return `— ${firstName(v)}, ${COMPANY_NAME}`
}

const CONDICION_LABELS: Record<string, string> = {
  contado: 'Contado',
  '7dias': '7 días',
  '14dias': '14 días',
  '30dias': '30 días',
}

// ─── Message builders ────────────────────────────────────────────────────────

export type ItemForMessage = {
  cantidad: number
  productoNombre: string
  precioUnitario: string | number
}

export type PedidoMessageInput = {
  clienteNombre: string
  vendedorName: string | null | undefined
  items: ItemForMessage[]
  total: number | string
  condicionPago?: 'contado' | '7dias' | '14dias' | '30dias' | null
  fechaEntrega?: string | Date | null
  fecha?: string | Date | null
}

/**
 * Mensaje al confirmar un pedido nuevo. Incluye detalle de productos,
 * total, condición de pago y fecha de entrega cuando estén disponibles.
 */
export function pedidoConfirmadoMessage(input: PedidoMessageInput): string {
  const lines: string[] = []
  const fechaTxt = input.fecha ? shortDate(input.fecha) : shortDate(new Date())

  lines.push(`Hola ${firstName(input.clienteNombre)}, te confirmo tu pedido del ${fechaTxt}:`)
  lines.push('')
  for (const it of input.items) {
    const subtotal = it.cantidad * parseFloat(String(it.precioUnitario))
    lines.push(`· ${it.cantidad}x ${it.productoNombre} — ${money(subtotal)}`)
  }
  lines.push('')
  lines.push(`Total: ${money(input.total)}`)
  if (input.condicionPago) {
    lines.push(`Pago: ${CONDICION_LABELS[input.condicionPago] ?? input.condicionPago}`)
  }
  if (input.fechaEntrega) {
    lines.push(`Entrega: ${shortDate(input.fechaEntrega)}`)
  }
  lines.push('')
  lines.push('Cualquier cosa me escribís.')
  lines.push('')
  lines.push(signature(input.vendedorName))
  return lines.join('\n')
}

export type CobroMessageInput = {
  clienteNombre: string
  vendedorName: string | null | undefined
  monto: number | string
  fecha?: string | Date | null
  metodo?: string | null
  saldoRestante?: number | null
}

/**
 * Mensaje al registrar un pago. Si `saldoRestante` es 0 o no se pasa, se
 * informa que la cuenta queda al día; si es > 0, se aclara el saldo pendiente.
 */
export function cobroConfirmadoMessage(input: CobroMessageInput): string {
  const lines: string[] = []
  const fechaTxt = shortDate(input.fecha ?? new Date())

  lines.push(`Hola ${firstName(input.clienteNombre)}, te confirmo que recibí tu pago de ${money(input.monto)} el ${fechaTxt}.`)
  if (input.metodo) {
    lines.push(`Forma de pago: ${input.metodo}`)
  }
  lines.push('')
  const saldo = typeof input.saldoRestante === 'number' ? input.saldoRestante : null
  if (saldo !== null && saldo > 0) {
    lines.push(`Saldo pendiente: ${money(saldo)}.`)
  } else {
    lines.push('Tu cuenta queda al día.')
  }
  lines.push('')
  lines.push('Muchas gracias.')
  lines.push('')
  lines.push(signature(input.vendedorName))
  return lines.join('\n')
}

export type RecordatorioMorosoInput = {
  clienteNombre: string
  vendedorName: string | null | undefined
  saldoPendiente: number | string
  diasVencido?: number | null
  fechaPedido?: string | Date | null
}

/**
 * Recordatorio de pago a un cliente moroso, con tono firme pero cordial.
 */
export function recordatorioMorosoMessage(input: RecordatorioMorosoInput): string {
  const lines: string[] = []
  const monto = money(input.saldoPendiente)

  const detalleVencimiento: string[] = []
  if (input.fechaPedido) detalleVencimiento.push(`del pedido del ${shortDate(input.fechaPedido)}`)
  if (typeof input.diasVencido === 'number' && input.diasVencido > 0) {
    detalleVencimiento.push(`con ${input.diasVencido} días de atraso`)
  }
  const detalle = detalleVencimiento.length > 0 ? ` ${detalleVencimiento.join(' ')}` : ''

  lines.push(`Hola ${firstName(input.clienteNombre)}, te recuerdo que tenés un saldo pendiente de ${monto}${detalle}.`)
  lines.push('')
  lines.push('¿Cuándo podemos coordinar el pago?')
  lines.push('')
  lines.push('Muchas gracias.')
  lines.push('')
  lines.push(signature(input.vendedorName))
  return lines.join('\n')
}

export type ResumenPedidoInput = {
  clienteNombre: string
  vendedorName: string | null | undefined
  fecha: string | Date
  total: number | string
  pagado?: number | string | null
  saldoPendiente?: number | string | null
}

/**
 * Reenvío de un pedido existente — usado en la lista de pedidos del cliente
 * cuando el comprador pierde el mensaje original o necesita una copia.
 * No incluye items porque la lista no los carga; el detalle del pedido es
 * un buen lugar futuro para una variante con detalle de productos.
 */
export function resumenPedidoMessage(input: ResumenPedidoInput): string {
  const lines: string[] = []
  lines.push(`Hola ${firstName(input.clienteNombre)}, te paso el resumen del pedido del ${shortDate(input.fecha)}:`)
  lines.push('')
  lines.push(`Total: ${money(input.total)}`)
  if (input.pagado != null) lines.push(`Pagado: ${money(input.pagado)}`)
  if (input.saldoPendiente != null && parseFloat(String(input.saldoPendiente)) > 0) {
    lines.push(`Saldo: ${money(input.saldoPendiente)}`)
  }
  lines.push('')
  lines.push('Cualquier consulta, escribime.')
  lines.push('')
  lines.push(signature(input.vendedorName))
  return lines.join('\n')
}
