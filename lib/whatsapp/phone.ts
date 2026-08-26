/**
 * Teléfonos en el formato con el que WhatsApp identifica a un contacto.
 *
 * WhatsApp manda los mensajes de Argentina SIEMPRE desde `+549` + área + número
 * (el "9" de celulares, sin el "15"). Para que un mensaje entrante caiga en la
 * conversación correcta, todo teléfono que guardamos en contactos y
 * conversaciones tiene que estar en ese mismo formato. Esta es la única
 * función que debe usarse para eso: intake de landings, alta manual e import
 * de leads, conversaciones de clientes y matching en el webhook.
 */

/** Solo dígitos del teléfono, sin nada más. */
function soloDigitos(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '')
}

/**
 * Número nacional argentino (área + abonado, 10 dígitos) a partir de cualquier
 * forma de escribirlo: con o sin +54, con o sin 9, con 0 de larga distancia,
 * con el 15 de celular, con espacios y guiones.
 */
function nacionalArgentino(digits: string): string {
  let d = digits
  if (d.startsWith('00')) d = d.slice(2)          // prefijo internacional 0054...
  if (d.startsWith('54')) d = d.slice(2)          // código de país
  d = d.replace(/^0/, '')                         // 0 de larga distancia (011, 0351)
  if (d.startsWith('9') && d.length > 10) d = d.slice(1) // 9 de celular ya presente
  // "15" entre el área y el abonado: 11 15 4162-8140 → 11 4162-8140.
  // El área tiene 2, 3 o 4 dígitos; con el 15 el total da 12.
  if (d.length === 12) {
    for (const area of [2, 3, 4]) {
      if (d.slice(area, area + 2) === '15') {
        d = d.slice(0, area) + d.slice(area + 2)
        break
      }
    }
  }
  return d
}

/**
 * Normaliza al formato E.164 de WhatsApp. Argentina → `+549` + nacional.
 * Otros países (escritos con + o 00 y otro código) se dejan con su código.
 * Devuelve null si no hay dígitos.
 */
export function toWhatsappE164(raw: string | null | undefined): string | null {
  const texto = String(raw ?? '').trim()
  const digits = soloDigitos(texto)
  if (!digits) return null

  const explicitoInternacional = texto.startsWith('+') || digits.startsWith('00')
  const sinPrefijo = digits.startsWith('00') ? digits.slice(2) : digits
  if (explicitoInternacional && !sinPrefijo.startsWith('54')) {
    return `+${sinPrefijo}`
  }

  const nacional = nacionalArgentino(digits)
  if (!nacional) return null
  return `+549${nacional}`
}

/** Igual que toWhatsappE164 pero sin el "+" (lo que pide la API de Meta en `to`). */
export function toWhatsappDigits(raw: string | null | undefined): string {
  return (toWhatsappE164(raw) ?? '').replace(/^\+/, '')
}

/**
 * Últimos 10 dígitos (área + abonado): sirve para comparar teléfonos guardados
 * en cualquier formato, por ejemplo `clientes.telefono` que es texto libre.
 */
export function ultimos10(raw: string | null | undefined): string {
  const e164 = toWhatsappE164(raw)
  return (e164 ?? '').replace(/\D/g, '').slice(-10)
}
