/**
 * Esquema del webhook de Meta (lib/validations/webhook.ts).
 *
 * Bug real: los avisos de estado (sent/delivered/read) vienen con `contacts`
 * sin `profile`; el esquema lo exigía y rechazaba el payload entero, así que
 * los tildes del chat nunca se actualizaron. Idem con tipos de mensaje que
 * no manejamos (reaction, contacts...): tiraban abajo todo lo que viniera junto.
 */
import { describe, it, expect } from 'vitest'
import { waWebhookSchema } from '@/lib/validations/webhook'

const base = (value: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [{
    id: '917295170943455',
    changes: [{
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '5491178243412', phone_number_id: '1265569909975983' },
        ...value,
      },
      field: 'messages',
    }],
  }],
})

describe('waWebhookSchema', () => {
  it('aviso de estado tal como lo manda Meta: contacts sin profile', () => {
    const payload = base({
      contacts: [{ wa_id: '5492966412541' }],
      statuses: [{
        id: 'wamid.HBgNNTQ5Mjk2NjQxMjU0MRUCABEYEjQ2RTc0RjM2QUY5RTk0OEZFQQA=',
        status: 'delivered',
        timestamp: '1757262000',
        recipient_id: '5492966412541',
        conversation: { id: 'abc', origin: { type: 'marketing' }, expiration_timestamp: '1757348400' },
        pricing: { billable: true, pricing_model: 'CBP', category: 'marketing' },
      }],
    })
    const r = waWebhookSchema.safeParse(payload)
    expect(r.success, r.success ? '' : r.error.message).toBe(true)
    if (r.success) {
      const st = r.data.entry[0]!.changes[0]!.value.statuses![0]!
      expect(st.status).toBe('delivered')
      expect(r.data.entry[0]!.changes[0]!.value.contacts![0]!.profile).toBeUndefined()
    }
  })

  it('estado fallido con errores y campos extra', () => {
    const payload = base({
      statuses: [{
        id: 'wamid.X', status: 'failed', timestamp: '1757262000', recipient_id: '5492966412541',
        errors: [{
          code: 131047, title: 'Re-engagement message', message: 'Re-engagement message',
          error_data: { details: 'Message failed to send because more than 24 hours have passed' },
          href: 'https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/',
        }],
      }],
    })
    expect(waWebhookSchema.safeParse(payload).success).toBe(true)
  })

  it('mensaje entrante con profile (como siempre) sigue validando', () => {
    const payload = base({
      contacts: [{ profile: { name: 'Guillermo' }, wa_id: '5492966412541' }],
      messages: [{ from: '5492966412541', id: 'wamid.in', timestamp: '1757262000', type: 'text', text: { body: 'Hola' } }],
    })
    const r = waWebhookSchema.safeParse(payload)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.entry[0]!.changes[0]!.value.contacts![0]!.profile?.name).toBe('Guillermo')
  })

  it('un tipo de mensaje que no manejamos (reaction) no tira abajo el payload', () => {
    const payload = base({
      contacts: [{ profile: { name: 'Guillermo' }, wa_id: '5492966412541' }],
      messages: [{ from: '5492966412541', id: 'wamid.r', timestamp: '1757262000', type: 'reaction', reaction: { message_id: 'wamid.x', emoji: '👍' } }],
    })
    expect(waWebhookSchema.safeParse(payload).success).toBe(true)
  })

  it('sigue rechazando lo que no es un webhook de WhatsApp', () => {
    expect(waWebhookSchema.safeParse({ object: 'page', entry: [] }).success).toBe(false)
    expect(waWebhookSchema.safeParse(base({ metadata: undefined })).success).toBe(false)
  })
})
