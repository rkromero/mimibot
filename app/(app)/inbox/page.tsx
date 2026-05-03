import { auth } from '@/lib/auth'
import InboxView from '@/components/inbox/InboxView'

export default async function InboxPage() {
  const session = await auth()
  return <InboxView user={session!.user} />
}
