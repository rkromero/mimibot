import { describe, it, expect, vi } from 'vitest'
import { withRetry } from '@/lib/claude/retry'

describe('withRetry', () => {
  it('devuelve el resultado si la primera llamada tiene éxito', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('reintenta en fallo y devuelve el resultado al segundo intento', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('ok')

    const result = await withRetry(fn, 2, 0)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('lanza el error después de agotar los reintentos', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('siempre falla'))
    await expect(withRetry(fn, 2, 0)).rejects.toThrow('siempre falla')
    expect(fn).toHaveBeenCalledTimes(3) // 1 intento + 2 reintentos
  })
})
