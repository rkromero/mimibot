import { z } from 'zod'

export const createLeadSchema = z.object({
  contactName: z.string().min(1).max(200),
  contactPhone: z.string().max(20).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  stageId: z.string().uuid(),
  source: z.enum(['whatsapp', 'landing', 'manual']).default('manual'),
  assignedTo: z.string().uuid().optional().nullable(),
  budget: z.string().optional().nullable(),
  productInterest: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string().uuid()).optional(),
})

export const updateLeadSchema = z.object({
  stageId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  budget: z.string().nullable().optional(),
  productInterest: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  botEnabled: z.boolean().optional(),
  customFields: z.record(z.unknown()).optional(),
})

export const intakeSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  message: z.string().max(2000).optional(),
  source: z.string().max(100).optional(),
})

export const leadFiltersSchema = z.object({
  agentId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  source: z.enum(['whatsapp', 'landing', 'manual']).optional(),
  search: z.string().max(200).optional(),
  stageId: z.string().uuid().optional(),
})

export type CreateLeadInput = z.infer<typeof createLeadSchema>
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>
export type IntakeInput = z.infer<typeof intakeSchema>
export type LeadFilters = z.infer<typeof leadFiltersSchema>
