import { db } from '@/db'
import BotConfigForm from './BotConfigForm'

export default async function BotSettingsPage() {
  const config = await db.query.botConfig.findFirst()
  return <BotConfigForm initialConfig={config ?? null} />
}
