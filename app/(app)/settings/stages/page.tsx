import { db } from '@/db'
import { pipelineStages } from '@/db/schema'
import { asc } from 'drizzle-orm'
import StagesManager from './StagesManager'

export default async function StagesPage() {
  const stages = await db.query.pipelineStages.findMany({
    orderBy: [asc(pipelineStages.position)],
  })
  return <StagesManager initialStages={stages} />
}
