import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { transcribirAudio, transcripcionHabilitada } from '@/lib/whatsapp/transcripcion'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('transcribirAudio', () => {
  it('sin OPENAI_API_KEY: deshabilitada y devuelve null sin llamar a la API', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(transcripcionHabilitada()).toBe(false)
    const r = await transcribirAudio(Buffer.from('audio'), 'audio/ogg')
    expect(r).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('con key: manda multipart a OpenAI y devuelve el texto', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: '  Hola, quiero cotizar alfajores  ' }),
    })

    const r = await transcribirAudio(Buffer.from('audio'), 'audio/ogg')

    expect(r).toBe('Hola, quiero cotizar alfajores')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions')
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-test')
    const form = init.body as FormData
    expect(form.get('model')).toBe('whisper-1')
    expect(form.get('language')).toBe('es')
  })

  it('error de la API: devuelve null sin lanzar', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('boom') })
    await expect(transcribirAudio(Buffer.from('a'), 'audio/ogg')).resolves.toBeNull()
  })

  it('transcripción vacía: devuelve null (no dispara el bot con texto vacío)', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ text: '   ' }) })
    await expect(transcribirAudio(Buffer.from('a'), 'audio/ogg')).resolves.toBeNull()
  })

  it('fetch que lanza (red caída): devuelve null sin lanzar', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    mockFetch.mockRejectedValue(new Error('ECONNRESET'))
    await expect(transcribirAudio(Buffer.from('a'), 'audio/ogg')).resolves.toBeNull()
  })
})
