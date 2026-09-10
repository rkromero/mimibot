import { z } from 'zod'

const waMediaObjectSchema = z.object({
  id: z.string(),
  mime_type: z.string().optional(),
  caption: z.string().optional(),
  filename: z.string().optional(),
  sha256: z.string().optional(),
})

const waInteractiveSchema = z.object({
  type: z.enum(['button_reply', 'list_reply']),
  button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
  list_reply: z.object({ id: z.string(), title: z.string(), description: z.string().optional() }).optional(),
})

const waMessageSchema = z.object({
  from: z.string(),    // phone en E.164 sin el +
  id: z.string(),      // wamid.XXX
  timestamp: z.string(),
  // Cualquier tipo: los que no manejamos (reaction, contacts, order, etc.) se
  // saltean en el webhook. Un enum cerrado hacía rechazar el payload entero,
  // y con él los demás mensajes y avisos de estado que vinieran juntos.
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  image: waMediaObjectSchema.optional(),
  audio: waMediaObjectSchema.optional(),
  video: waMediaObjectSchema.optional(),
  document: waMediaObjectSchema.optional(),
  interactive: waInteractiveSchema.optional(),
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
        // En los avisos de estado (sent/delivered/read) Meta manda `contacts`
        // solo con wa_id, sin profile: si fuera obligatorio, se rechazaría el
        // payload entero y los tildes del chat nunca se actualizarían.
        contacts: z.array(z.object({
          profile: z.object({ name: z.string() }).optional(),
          wa_id: z.string(),
        })).optional(),
        messages: z.array(waMessageSchema).optional(),
        statuses: z.array(z.object({
          id: z.string(),
          status: z.string(),
          timestamp: z.string(),
          recipient_id: z.string(),
          errors: z.array(z.object({
            code: z.number().optional(),
            title: z.string().optional(),
            message: z.string().optional(),
            error_data: z.object({ details: z.string().optional() }).optional(),
          })).optional(),
        })).optional(),
      }),
      field: z.string(),
    })),
  })),
})

export type WaWebhookPayload = z.infer<typeof waWebhookSchema>
export type WaMessage = z.infer<typeof waMessageSchema>
