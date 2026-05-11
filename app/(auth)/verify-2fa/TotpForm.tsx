'use client'

import { useState, useRef, useTransition } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

export default function TotpForm() {
  const { update } = useSession()
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
    setCode(val)
    setError(null)
    if (val.length === 6) void submit(val)
  }

  async function submit(c: string) {
    startTransition(async () => {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }

      if (!data.ok) {
        setError(data.error ?? 'Código incorrecto')
        setCode('')
        inputRef.current?.focus()
        return
      }

      // Mark TOTP as verified in the JWT
      await update({ totpVerified: true })
      router.replace('/')
    })
  }

  return (
    <div className="space-y-5">
      {/* Visual digit display */}
      <div className="flex justify-center gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            onClick={() => inputRef.current?.focus()}
            className={cn(
              'w-11 h-14 rounded-xl border-2 flex items-center justify-center text-xl font-mono font-semibold cursor-text transition-colors',
              code[i]
                ? 'border-primary text-foreground'
                : i === code.length
                  ? 'border-primary/60 bg-primary/5'
                  : 'border-border text-transparent',
            )}
          >
            {code[i] ?? '·'}
          </div>
        ))}
      </div>

      {/* Hidden real input for keyboard */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        autoFocus
        value={code}
        onChange={handleInput}
        className="sr-only"
        aria-label="Código TOTP"
      />

      {error && (
        <p className="text-center text-sm text-destructive">{error}</p>
      )}

      <button
        onClick={() => void submit(code)}
        disabled={code.length < 6 || isPending}
        className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-50 transition-opacity"
      >
        {isPending ? 'Verificando...' : 'Verificar'}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        Abrí Google Authenticator o similar y copiá el código de 6 dígitos
      </p>
    </div>
  )
}
