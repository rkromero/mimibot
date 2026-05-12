import { db } from '@/db'
import WhatsappConfigForm from './WhatsappConfigForm'

export default async function WhatsappSettingsPage() {
  const config = await db.query.whatsappConfig.findFirst()
  return <WhatsappConfigForm initialConfig={config ?? null} />
}
