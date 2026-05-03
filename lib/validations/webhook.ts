import { z } from 'zod'

const waMediaObjectSchema = z.object({
  id: z.string(),
  mime_type: z.string().optional(),
  caption: z.string().optional(),
  filename: z.string().optional(),
  sha256: z.string().optional(),
})

const waMessageSchema = z.object({
  from: z.string(),    // phone en E.164 sin el +
  id: z.string(),      // wamid.XXX
  timestamp: z.string(),
  type: z.enum(['text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'button', 'interactive', 'system', 'unknown']),
  text: z.object({ body: z.string() }).optional(),
  image: waMediaObjectSchema.optional(),
  audio: waMediaObjectSchema.optional(),
  video: waMediaObjectSchema.optional(),
  document: waMediaObjectSchema.optional(),
})

export const waWebhookSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(z.object({
    id: z.string(),
    changes: z.array(z.object({
      value: z.object({
        messaging_product: z.string(),
        metadata: z.object({
          display_phone_number: z.string(),
          phone_number_id: z.string(),
        }),
        contacts: z.array(z.object({
          profile: z.object({ name: z.string() }),
          wa_id: z.string(),
        })).optional(),
        messages: z.array(waMessageSchema).optional(),
        statuses: z.array(z.object({
          id: z.string(),
          status: z.string(),
          timestamp: z.string(),
          recipient_id: z.string(),
        })).optional(),
      }),
      field: z.string(),
    })),
  })),
})

export type WaWebhookPayload = z.infer<typeof waWebhookSchema>
export type WaMessage = z.infer<typeof waMessageSchema>
