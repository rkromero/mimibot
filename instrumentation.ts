/**
 * Arranque del servidor (Next.js instrumentation hook).
 *
 * 1. Red de seguridad del bot: cada 30 s responde los leads cuya espera
 *    (Ajustes → Bot → segundos antes de responder) venció y quedaron sin
 *    timer en memoria, típicamente por un reinicio del server en el medio.
 *
 * 2. Programador interno de seguimientos: cada 5 minutos procesa los
 *    seguimientos vencidos (POST /api/followup/process hace lo mismo a mano o
 *    desde un cron externo). Sin esto, en Railway no hay nada que dispare los
 *    seguimientos automáticos (propuesta enviada, estancamiento, sin respuesta).
 *    Se desactiva con FOLLOWUP_SCHEDULER=off (por ejemplo si se configura un
 *    cron externo, para no procesar dos veces).
 */
const INTERVALO_MS = 5 * 60 * 1000
const INTERVALO_BOT_MS = 30 * 1000

declare global {
  // eslint-disable-next-line no-var
  var __followupScheduler: NodeJS.Timeout | undefined
  // eslint-disable-next-line no-var
  var __botPendientesScheduler: NodeJS.Timeout | undefined
}

export async function register() {
  if (process.env['NEXT_RUNTIME'] !== 'nodejs') return

  if (!globalThis.__botPendientesScheduler) {
    const { retomarTurnosBotPendientes } = await import('@/lib/claude/bot-debounce')
    const tickBot = async () => {
      try {
        const n = await retomarTurnosBotPendientes()
        if (n > 0) console.log(`[bot] respuestas pendientes retomadas: ${n}`)
      } catch (err) {
        console.error('[bot] scheduler error:', err)
      }
    }
    setTimeout(() => void tickBot(), 20_000)
    globalThis.__botPendientesScheduler = setInterval(() => void tickBot(), INTERVALO_BOT_MS)
  }

  if (process.env['FOLLOWUP_SCHEDULER'] === 'off') return
  if (globalThis.__followupScheduler) return // hot reload en dev

  const { processFollowUps } = await import('@/lib/followup/engine')

  const tick = async () => {
    try {
      const r = await processFollowUps()
      if (r.processed > 0 || r.errors > 0) {
        console.log(`[followup] procesados: ${r.processed}, errores: ${r.errors}`)
      }
    } catch (err) {
      console.error('[followup] scheduler error:', err)
    }
  }

  // Primer tick a los 30 s (deja levantar la app) y después cada 5 minutos
  setTimeout(() => void tick(), 30_000)
  globalThis.__followupScheduler = setInterval(() => void tick(), INTERVALO_MS)
}
