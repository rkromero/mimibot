/**
 * Arranque del servidor (Next.js instrumentation hook).
 *
 * Este archivo se compila también para el runtime edge, que no tiene los
 * módulos de Node que usa la base (postgres → stream, perf_hooks…). Por eso
 * todo lo que toca la base va en lib/server/schedulers y se importa solo
 * adentro del `if` de runtime Node: webpack reemplaza NEXT_RUNTIME por una
 * constante y descarta la rama entera en la compilación edge (un `return`
 * temprano no alcanza: el import igual se resolvería y rompería el build).
 */
export async function register() {
  if (process.env['NEXT_RUNTIME'] === 'nodejs') {
    const { registrarSchedulers } = await import('@/lib/server/schedulers')
    registrarSchedulers()
  }
}
