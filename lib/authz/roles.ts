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

/**
 * Roles de reparto. En esta fase 'distribucion' es un CLON de 'repartidor':
 * misma UI, mismos endpoints y mismo flujo de aceptar/entregar/cobrar/optimizar
 * ruta. La diferencia por marcas llega en una fase posterior. Por eso ambos
 * aparecen juntos en cualquier check que trate a 'repartidor' como rol de reparto.
 */
export const ROLES_REPARTO = ['repartidor', 'distribucion'] as const

export type RolVentasRestringido = (typeof ROLES_VENTAS_RESTRINGIDOS)[number]
export type RolTipoAgent = (typeof ROLES_TIPO_AGENT)[number]
export type RolReparto = (typeof ROLES_REPARTO)[number]

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

/**
 * ¿El rol es un rol de reparto? Reemplaza los checks `role === 'repartidor'`
 * (y los guards `role !== 'repartidor' && ...`) en todo el flujo de reparto.
 * 'distribucion' es, en esta fase, un clon de 'repartidor'.
 */
export function esRolReparto(role: string | null | undefined): boolean {
  return role === 'repartidor' || role === 'distribucion'
}
