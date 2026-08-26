/**
 * Estado y reglas del formulario "¿Cómo recibe el cliente la mercadería?".
 *
 * Lo comparten el paso "Entrega" del alta de pedidos (agentes) y el modal de
 * muestra desde el lead, para que ambos flujos pidan exactamente lo mismo:
 * retiro en fábrica o envío por expreso (y, en ese caso, cuál).
 */

export type MetodoEntrega = 'retiro_fabrica' | 'expreso'

export type EntregaFormState = {
  metodoEntrega: MetodoEntrega | null
  /** null = todavía no eligió; true = despacha por el expreso guardado; false = carga uno nuevo */
  usarExpresoGuardado: boolean | null
  nuevoExpresoNombre: string
  nuevoExpresoDireccion: string
}

/** Expreso guardado en la ficha del cliente (si ya recibió envíos). */
export type ExpresoGuardado = { nombre: string; direccion: string | null } | null

export type EntregaPayload = {
  metodoEntrega: MetodoEntrega
  expresoNombre?: string
  expresoDireccion?: string
}

export const ENTREGA_FORM_INICIAL: EntregaFormState = {
  metodoEntrega: null,
  usarExpresoGuardado: null,
  nuevoExpresoNombre: '',
  nuevoExpresoDireccion: '',
}

/** ¿El usuario tiene que tipear un expreso nuevo (no hay guardado o eligió cambiarlo)? */
export function debeIngresarExpresoNuevo(form: EntregaFormState, guardado: ExpresoGuardado): boolean {
  return !guardado || form.usarExpresoGuardado === false
}

/** ¿El formulario de entrega está completo como para avanzar/confirmar? */
export function entregaCompleta(form: EntregaFormState, guardado: ExpresoGuardado): boolean {
  if (form.metodoEntrega === 'retiro_fabrica') return true
  if (form.metodoEntrega !== 'expreso') return false
  if (guardado && form.usarExpresoGuardado === true) return true
  if (debeIngresarExpresoNuevo(form, guardado)) {
    return form.nuevoExpresoNombre.trim().length > 0 && form.nuevoExpresoDireccion.trim().length > 0
  }
  return false
}

/**
 * Arma el payload de entrega para la API. Solo manda nombre/dirección de
 * expreso cuando el usuario cargó uno nuevo; si eligió el guardado, el server
 * usa el de la ficha del cliente.
 */
export function buildEntregaPayload(form: EntregaFormState, guardado: ExpresoGuardado): EntregaPayload | null {
  if (!form.metodoEntrega) return null
  const payload: EntregaPayload = { metodoEntrega: form.metodoEntrega }
  if (form.metodoEntrega === 'expreso' && debeIngresarExpresoNuevo(form, guardado)) {
    payload.expresoNombre = form.nuevoExpresoNombre.trim()
    payload.expresoDireccion = form.nuevoExpresoDireccion.trim()
  }
  return payload
}

/** Datos de entrega que recibe la API al crear un pedido. */
export type EntregaInput = {
  metodoEntrega?: MetodoEntrega | null
  expresoNombre?: string | null
  expresoDireccion?: string | null
}

export type EntregaResuelta = {
  metodoEntrega: MetodoEntrega | null
  expresoNombre: string | null
  expresoDireccion: string | null
  /** true cuando vino un expreso nuevo y hay que pisarlo en la ficha del cliente */
  actualizarFichaCliente: boolean
}

const SIN_ENTREGA: EntregaResuelta = {
  metodoEntrega: null,
  expresoNombre: null,
  expresoDireccion: null,
  actualizarFichaCliente: false,
}

/**
 * Resuelve, del lado del server, qué entrega queda grabada en el pedido.
 * - Sin método: no se toca nada.
 * - Retiro en fábrica: sin expreso.
 * - Expreso con nombre y dirección: es uno nuevo, se usa y se guarda en la ficha.
 * - Expreso sin datos: se usa el guardado en la ficha del cliente.
 */
export function resolverEntrega(input: EntregaInput, fichaCliente: ExpresoGuardado): EntregaResuelta {
  if (!input.metodoEntrega) return SIN_ENTREGA
  if (input.metodoEntrega === 'retiro_fabrica') {
    return { ...SIN_ENTREGA, metodoEntrega: 'retiro_fabrica' }
  }
  if (input.expresoNombre && input.expresoDireccion) {
    return {
      metodoEntrega: 'expreso',
      expresoNombre: input.expresoNombre,
      expresoDireccion: input.expresoDireccion,
      actualizarFichaCliente: true,
    }
  }
  return {
    metodoEntrega: 'expreso',
    expresoNombre: fichaCliente?.nombre ?? null,
    expresoDireccion: fichaCliente?.direccion ?? null,
    actualizarFichaCliente: false,
  }
}
