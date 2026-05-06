const WA_API_VERSION = 'v21.0'
const WA_API_BASE = `https://graph.facebook.com/${WA_API_VERSION}`

function getConfig() {
  const phoneNumberId = process.env['WA_PHONE_NUMBER_ID']
  const accessToken = process.env['WA_ACCESS_TOKEN']
  if (!phoneNumberId || !accessToken) {
    throw new Error('WA_PHONE_NUMBER_ID y WA_ACCESS_TOKEN son requeridos')
  }
  return { phoneNumberId, accessToken }
}

async function waFetch(path: string, options: RequestInit): Promise<unknown> {
  const { accessToken } = getConfig()
  const res = await fetch(`${WA_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`WhatsApp API error ${res.status}: ${body}`)
  }

  return res.json()
}

export async function sendTextMessage(to: string, body: string): Promise<string> {
  const { phoneNumberId } = getConfig()
  const data = await waFetch(`/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body, preview_url: false },
    }),
  }) as { messages: Array<{ id: string }> }

  return data.messages[0]!.id
}

type TemplateComponent = {
  type: 'body' | 'header'
  parameters: Array<{ type: 'text'; text: string }>
}

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  language: string,
  components?: TemplateComponent[],
): Promise<string> {
  const { phoneNumberId } = getConfig()
  const data = await waFetch(`/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        ...(components?.length ? { components } : {}),
      },
    }),
  }) as { messages: Array<{ id: string }> }

  return data.messages[0]!.id
}

export async function sendMediaMessage(
  to: string,
  mediaId: string,
  mediaType: 'image' | 'audio' | 'video' | 'document',
  caption?: string,
): Promise<string> {
  const { phoneNumberId } = getConfig()

  const mediaPayload: Record<string, unknown> = { id: mediaId }
  if (caption && (mediaType === 'image' || mediaType === 'video' || mediaType === 'document')) {
    mediaPayload['caption'] = caption
  }

  const data = await waFetch(`/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: mediaType,
      [mediaType]: mediaPayload,
    }),
  }) as { messages: Array<{ id: string }> }

  return data.messages[0]!.id
}

// Sube un buffer a Meta y devuelve el media_id para usarlo en mensajes
export async function uploadMediaToMeta(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const { phoneNumberId, accessToken } = getConfig()

  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', mimeType)
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename)

  const res = await fetch(`${WA_API_BASE}/${phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Upload media Meta error ${res.status}: ${body}`)
  }

  const data = await res.json() as { id: string }
  return data.id
}

// Obtiene la URL de descarga de un media de Meta y lo devuelve como Buffer
export async function downloadMediaFromMeta(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const { accessToken } = getConfig()

  // Paso 1: obtener la URL
  const metaRes = await fetch(`${WA_API_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!metaRes.ok) throw new Error(`No se pudo obtener metadata del media ${mediaId}`)
  const meta = await metaRes.json() as { url: string; mime_type: string }

  // Paso 2: descargar el binario
  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!fileRes.ok) throw new Error(`No se pudo descargar el media ${mediaId}`)

  const arrayBuffer = await fileRes.arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: meta.mime_type,
  }
}
