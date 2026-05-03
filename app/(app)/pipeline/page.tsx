import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pipelineStages } from '@/db/schema'
import { asc } from 'drizzle-orm'
import KanbanBoard from '@/components/pipeline/KanbanBoard'

export default async function PipelinePage() {
  const session = await auth()
  const stages = await db.query.pipelineStages.findMany({
    orderBy: [asc(pipelineStages.position)],
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
        <h1 className="text-md font-semibold">Pipeline</h1>
      </div>
      <KanbanBoard stages={stages} user={session!.user} />
    </div>
  )
}
