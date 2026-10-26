/**
 * Propuesta automática al calificar: qué le pedimos al bot que deje en el
 * [RESUMEN] (cantidad, gramaje, packaging) y cómo se lee después. Sin DB,
 * testeable. La creación en sí está en bot-propuesta.ts.
 */
import type { PackagingCotizacion } from '@/lib/cotizador/calculo'

export const GRAMAJE_DEFAULT_BOT = 60

export type DatosCotizacionBot = {
  cantidad: number
  gramaje: number
  packaging: PackagingCotizacion
  /** Aclaraciones para la nota interna (gramaje por defecto, packaging asumido) */
  supuestos: string[]
}

export type ResultadoExtraccion =
  | { ok: true; datos: DatosCotizacionBot }
  | { ok: false; motivo: string }

/**
 * Sección del system prompt: qué necesita el cotizador y cómo dejarlo en el
 * [RESUMEN] con formato fijo (igual que "Empresa: ...").
 */
export function armarSeccionCotizacion(
  gramajesDisponibles: readonly number[],
  gramajeDefault: number = GRAMAJE_DEFAULT_BOT,
): string {
  const gramajes = [...new Set(gramajesDisponibles)].sort((a, b) => a - b)
  const opciones = gramajes.length > 0 ? gramajes.map((g) => `${g} g`).join(', ') : `${gramajeDefault} g`
  return [
    '## Datos para cotizar',
    'La propuesta por escrito se arma sola con tres datos. Antes de cerrar asegurate de tenerlos:',
    '- Cantidad de alfajores del pedido (un número). Si no la dijo, preguntala.',
    `- Gramaje por alfajor. Opciones: ${opciones}. Si no lo menciona o le da igual, es ${gramajeDefault} g: no insistas.`,
    '- Packaging: cristal (flow pack transparente, sin impresión) o personalizado (bobina impresa con su marca). Si no lo dijo, preguntalo una vez.',
    'En el bloque [RESUMEN] final incluí SIEMPRE estas tres líneas, cada una en su renglón y con este formato exacto:',
    'Cantidad: <número de alfajores> (o "Cantidad: -" si no la dijo)',
    `Gramaje: <número en gramos> (o "Gramaje: -" si no lo dijo)`,
    'Packaging: cristal | personalizado (o "Packaging: -" si no lo dijo)',
  ].join('\n')
}

const VACIO = new Set(['', '-', '--', '—', 'no', 'n/a', 'na', 'no dijo', 'no lo dijo', 'no indica', 'no especificado', 'no especificada', 'sin datos', 'a definir', 'a confirmar', 'nd', 'n.d.'])

function leerLinea(resumen: string, campo: RegExp): string | null {
  const m = campo.exec(resumen)
  if (!m) return null
  const valor = m[1]!.replace(/^["'“”]+|["'“”.]+$/g, '').replace(/\s+/g, ' ').trim()
  return VACIO.has(valor.toLowerCase()) ? null : valor
}

const RE_CANTIDAD = /^\s*[-*•]?\s*cantidad(?:\s*(?:de alfajores|estimada|aproximada|inicial|por pedido|mensual|del pedido))?\s*:\s*(.+?)\s*$/im
const RE_GRAMAJE = /^\s*[-*•]?\s*(?:gramaje|peso)(?:\s*por alfajor)?\s*:\s*(.+?)\s*$/im
const RE_PACKAGING = /^\s*[-*•]?\s*(?:packaging|envase|envoltorio|empaque)\s*:\s*(.+?)\s*$/im

/**
 * Primer número entero de un texto, tolerando separador de miles ("2.000",
 * "2 000"), "2k", "2 mil" y "2000 unidades". En un rango ("500 a 1000") toma
 * el primero. Devuelve null si no hay número.
 */
export function parsearCantidad(texto: string | null | undefined): number | null {
  if (!texto) return null
  const t = texto.toLowerCase().replace(/\s+/g, ' ').trim()
  const m = /(\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(k\b|mil\b)?/.exec(t)
  if (!m) return null
  let n: number
  const crudo = m[1]!
  if (/^\d{1,3}(?:[.\s]\d{3})+$/.test(crudo)) n = Number(crudo.replace(/[.\s]/g, ''))
  else n = Number(crudo.replace(',', '.'))
  if (m[2]) n *= 1000
  if (!Number.isFinite(n)) return null
  n = Math.round(n)
  return n > 0 ? n : null
}

/** "cristal" / "personalizado" a partir de lo que escribió el bot; null si no se entiende. */
export function parsearPackaging(texto: string | null | undefined): PackagingCotizacion | null {
  if (!texto) return null
  const t = texto.toLowerCase()
  if (/personaliz|impres|con (?:su|la|mi|tu) marca|bobina|propi[oa]|dise[ñn]o/.test(t)) return 'personalizado'
  if (/cristal|transparente|flow ?pack|neutro|sin impres|liso|gen[eé]rico|est[aá]ndar|sin marca/.test(t)) return 'cristal'
  return null
}

/**
 * Lee del [RESUMEN] los datos para cotizar. Sin cantidad no se cotiza (nunca
 * se inventa). Sin gramaje se usa el default; con un gramaje que no existe en
 * el cotizador tampoco se cotiza. Sin packaging se asume cristal y se avisa.
 */
export function extraerDatosCotizacion(
  resumen: string | null | undefined,
  opts: { gramajesDisponibles: readonly number[]; gramajeDefault?: number },
): ResultadoExtraccion {
  if (!resumen?.trim()) return { ok: false, motivo: 'el bot no dejó resumen' }
  const gramajeDefault = opts.gramajeDefault ?? GRAMAJE_DEFAULT_BOT
  const supuestos: string[] = []

  const cantidad = parsearCantidad(leerLinea(resumen, RE_CANTIDAD))
  if (cantidad === null) return { ok: false, motivo: 'el bot no relevó la cantidad de alfajores' }

  const gramajeTexto = leerLinea(resumen, RE_GRAMAJE)
  let gramaje: number
  if (gramajeTexto === null) {
    gramaje = gramajeDefault
    supuestos.push(`gramaje no indicado: se cotizó ${gramajeDefault} g`)
  } else {
    const g = parsearCantidad(gramajeTexto)
    if (g === null) {
      gramaje = gramajeDefault
      supuestos.push(`gramaje "${gramajeTexto}" no se entendió: se cotizó ${gramajeDefault} g`)
    } else {
      gramaje = g
    }
  }
  if (opts.gramajesDisponibles.length > 0 && !opts.gramajesDisponibles.includes(gramaje)) {
    return { ok: false, motivo: `no hay receta del cotizador para ${gramaje} g` }
  }

  const packagingTexto = leerLinea(resumen, RE_PACKAGING)
  let packaging = parsearPackaging(packagingTexto)
  if (packaging === null) {
    packaging = 'cristal'
    supuestos.push(
      packagingTexto ? `packaging "${packagingTexto}" no se entendió: se cotizó cristal` : 'packaging no indicado: se cotizó cristal',
    )
  }

  return { ok: true, datos: { cantidad, gramaje, packaging, supuestos } }
}

export function formatNumeroPropuesta(n: number): string {
  return `PROP-${String(n).padStart(5, '0')}`
}

export function formatPesos(n: number): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/** Texto de la nota interna que queda en el chat al crear la propuesta sola. */
export function armarNotaPropuestaCreada(params: {
  numero: number
  datos: DatosCotizacionBot
  total: number | null
  vigenteHasta: string | null
}): string {
  const { numero, datos, total, vigenteHasta } = params
  const partes = [
    `Propuesta ${formatNumeroPropuesta(numero)} creada automáticamente por el bot: ` +
      `${datos.cantidad.toLocaleString('es-AR')} alfajores de ${datos.gramaje} g, packaging ${datos.packaging}` +
      (total !== null ? `, total ${formatPesos(total)} (IVA incluido)` : '') +
      (vigenteHasta ? `, vigente hasta ${vigenteHasta}` : '') +
      '. Quedó en borrador: revisala y enviala desde la ficha del lead.',
  ]
  if (datos.supuestos.length > 0) partes.push(`Ojo: ${datos.supuestos.join('; ')}.`)
  return partes.join('\n')
}
