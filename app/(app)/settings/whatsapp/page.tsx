import { db } from '@/db'
import WhatsappConfigForm from './WhatsappConfigForm'

// Force dynamic so this Server Component never gets prerendered with a stale
// DB state and always reflects the latest config (or absence thereof).
export const dynamic = 'force-dynamic'

export default async function WhatsappSettingsPage() {
  // Defensive read: if the whatsapp_config table doesn't exist yet (e.g. the
  // 0011 migration hasn't been applied to this environment), we don't want the
  // whole route to throw a Server Component error. Treat it as "no config yet"
  // and let the user save once the table is in place.
  let config: Awaited<ReturnType<typeof db.query.whatsappConfig.findFirst>> | null = null
  try {
    const result = await db.query.whatsappConfig.findFirst()
    config = result ?? null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[settings/whatsapp page] could not read whatsapp_config:', msg)
    config = null
  }
  return <WhatsappConfigForm initialConfig={config} />
}
