/**
 * Definiciones centralizadas de roles de ventas.
 *
 * Evita duplicar los checks de rol repartidos por toda la app. El rol 'rtv'
 * es, en esta fase, un CLON de 'agent': misma operatoria, permisos, pantallas
 * y restricciones. La diferencia funcional (marcas asignadas) llega en fases
 * posteriores. Por eso 'rtv' aparece junto a 'agent' en ambos grupos.
 */

/**
 * Roles de ventas con cartera/territorio restringido. Se usan en los checks
 * del tipo `role === 'agent' || role === 'vendedor'`, donde tanto agent como
 * vendedor quedan limitados a lo asignado a ellos.
 */
export const ROLES_VENTAS_RESTRINGIDOS = ['agent', 'vendedor', 'rtv'] as const

/**
 * Roles que operan EXACTAMENTE como 'agent' (flujo de método de entrega,
 * comprobantes de pago, vista de agente, etc.). OJO: 'vendedor' NO está acá
 * porque su flujo está "congelado" y difiere del de agent en varios lugares.
 */
export const ROLES_TIPO_AGENT = ['agent', 'rtv'] as const

export type RolVentasRestringido = (typeof ROLES_VENTAS_RESTRINGIDOS)[number]
export type RolTipoAgent = (typeof ROLES_TIPO_AGENT)[number]

/**
 * ¿El rol es un rol de ventas con cartera/territorio restringido?
 * Reemplaza los checks `role === 'agent' || role === 'vendedor'`.
 */
export function esRolVentas(role: string | null | undefined): boolean {
  return role === 'agent' || role === 'vendedor' || role === 'rtv'
}

/**
 * ¿El rol opera exactamente como 'agent'? Reemplaza los checks `role === 'agent'`
 * que NO incluyen a 'vendedor'. 'rtv' es un clon de 'agent', así que entra acá.
 */
export function esRolTipoAgent(role: string | null | undefined): boolean {
  return role === 'agent' || role === 'rtv'
}
