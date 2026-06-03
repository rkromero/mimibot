/**
 * Centralized role-to-home-route mapping.
 * Edge-compatible: pure string operations, no server imports.
 *
 * Role mapping:
 *   admin    → /admin/dashboard  (team metrics, all vendors)
 *   gerente  → /admin/dashboard  (team metrics filtered by territory)
 *   vendedor → /dashboard         (personal KPIs + Mi Cartera)
 *   agent    → /dashboard         (personal KPIs + Mi Cartera)
 *   fabrica  → /fabrica           (production/dispatch view)
 *   other    → /pipeline          (fallback)
 */
export function getHomeRouteByRole(role: string | null | undefined): string {
  switch (role) {
    case 'admin':
    case 'gerente':
      return '/admin/dashboard'
    case 'vendedor':
    case 'agent':
      return '/dashboard'
    case 'fabrica':
      return '/fabrica'
    case 'repartidor':
      return '/repartidor'
    default:
      return '/pipeline'
  }
}
