// Transcripción de notas de voz de WhatsApp para que el bot pueda
// procesarlas: Claude no acepta audio como input, así que el audio se
// transcribe con la API de OpenAI (Whisper) y el texto queda como body del
// mensaje. Sin OPENAI_API_KEY configurada se degrada en silencio: los audios
// se guardan como siempre y el bot no los responde (comportamiento previo).

const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions'

export function transcripcionHabilitada(): boolean {
  return !!process.env['OPENAI_API_KEY']
}

function extensionDe(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac')) return 'm4a'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('wav')) return 'wav'
  return 'ogg' // las notas de voz de WhatsApp llegan como audio/ogg (opus)
}

/**
 * Transcribe un audio. Devuelve el texto, o null si la transcripción está
 * deshabilitada (sin API key), falla, o vuelve vacía. Nunca lanza.
 */
export async function transcribirAudio(buffer: Buffer, mimeType: string): Promise<string | null> {
  const apiKey = process.env['OPENAI_API_KEY']
  if (!apiKey) return null
  const modelo = process.env['OPENAI_TRANSCRIBE_MODEL'] || 'whisper-1'

  try {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), `audio.${extensionDe(mimeType)}`)
    form.append('model', modelo)
    form.append('language', 'es')

    const res = await fetch(OPENAI_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
    if (!res.ok) {
      const detalle = await res.text().catch(() => '')
      console.error(`[transcripcion] OpenAI ${res.status}: ${detalle.slice(0, 300)}`)
      return null
    }
    const json = await res.json() as { text?: string }
    const texto = json.text?.trim()
    return texto || null
  } catch (err) {
    console.error('[transcripcion] error transcribiendo audio:', err)
    return null
  }
}
