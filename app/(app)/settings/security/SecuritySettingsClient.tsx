'use client'

import { useState } from 'react'
import { ShieldCheck, ShieldOff, KeyRound, Loader2, Check, Eye, EyeOff } from 'lucide-react'

const PIN_KEY = 'mimi_pin_v1'

type Props = { totpEnabled: boolean }

export default function SecuritySettingsClient({ totpEnabled: initialEnabled }: Props) {
  // 2FA state
  const [totpEnabled, setTotpEnabled] = useState(initialEnabled)
  const [setupStep, setSetupStep] = useState<'idle' | 'qr' | 'verify' | 'done'>('idle')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [totpError, setTotpError] = useState('')
  const [totpLoading, setTotpLoading] = useState(false)

  // PIN state
  const [pinEnabled, setPinEnabled] = useState(() => !!localStorage.getItem(PIN_KEY))
  const [pinStep, setPinStep] = useState<'idle' | 'set' | 'confirm'>('idle')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [pinError, setPinError] = useState('')

  // ── 2FA handlers ─────────────────────────────────────────────────────────────

  async function startSetup() {
    setTotpLoading(true)
    const res = await fetch('/api/auth/2fa/setup')
    const data = await res.json() as { qrDataUrl: string; secret: string }
    setQrDataUrl(data.qrDataUrl)
    setSecret(data.secret)
    setSetupStep('qr')
    setTotpLoading(false)
  }

  async function enableTotp() {
    if (totpCode.length !== 6) return
    setTotpLoading(true)
    setTotpError('')
    const res = await fetch('/api/auth/2fa/enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: totpCode }),
    })
    const data = await res.json() as { ok?: boolean; error?: string }
    setTotpLoading(false)
    if (data.ok) {
      setTotpEnabled(true)
      setSetupStep('done')
    } else {
      setTotpError(data.error ?? 'Código incorrecto')
      setTotpCode('')
    }
  }

  async function disableTotp() {
    setTotpLoading(true)
    await fetch('/api/auth/2fa/disable', { method: 'DELETE' })
    setTotpEnabled(false)
    setSetupStep('idle')
    setTotpLoading(false)
  }

  // ── PIN handlers ──────────────────────────────────────────────────────────────

  function savePin() {
    if (pin.length < 4) { setPinError('El PIN debe tener al menos 4 dígitos'); return }
    if (pinStep === 'set') { setPinStep('confirm'); return }
    if (pin !== pinConfirm) { setPinError('Los PINs no coinciden'); setPinConfirm(''); return }
    localStorage.setItem(PIN_KEY, pin)
    setPinEnabled(true)
    setPinStep('idle')
    setPin('')
    setPinConfirm('')
    setPinError('')
  }

  function removePin() {
    localStorage.removeItem(PIN_KEY)
    setPinEnabled(false)
    setPinStep('idle')
    setPin('')
  }

  return (
    <div className="max-w-xl space-y-8">
      <h2 className="text-lg font-semibold text-foreground">Seguridad</h2>

      {/* ── 2FA section ─────────────────────────────────────────────────────── */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <ShieldCheck size={20} className="text-primary shrink-0" />
          <div>
            <h3 className="text-sm font-semibold">Verificación en dos pasos (2FA)</h3>
            <p className="text-xs text-muted-foreground">
              Protege tu cuenta con un código TOTP (Google Authenticator, Authy, etc.)
            </p>
          </div>
          <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${totpEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-muted text-muted-foreground'}`}>
            {totpEnabled ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        {/* Setup flow */}
        {!totpEnabled && setupStep === 'idle' && (
          <button
            onClick={() => void startSetup()}
            disabled={totpLoading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 transition-opacity"
          >
            {totpLoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            Activar 2FA
          </button>
        )}

        {setupStep === 'qr' && qrDataUrl && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Escaneá el código QR con tu app autenticadora, luego ingresá el código de 6 dígitos.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR 2FA" className="w-48 h-48 rounded-lg border border-border mx-auto" />
            {secret && (
              <p className="text-xs text-center text-muted-foreground font-mono bg-muted rounded px-3 py-1.5 select-all">
                {secret}
              </p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={totpCode}
                onChange={(e) => { setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setTotpError('') }}
                placeholder="123456"
                className="flex-1 px-3 py-2 border border-border rounded-lg text-[16px] font-mono bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={() => void enableTotp()}
                disabled={totpCode.length < 6 || totpLoading}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {totpLoading ? <Loader2 size={14} className="animate-spin" /> : 'Verificar'}
              </button>
            </div>
            {totpError && <p className="text-xs text-destructive">{totpError}</p>}
          </div>
        )}

        {(setupStep === 'done' || totpEnabled) && setupStep !== 'idle' && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <Check size={16} />
            2FA activado correctamente
          </div>
        )}

        {totpEnabled && (
          <button
            onClick={() => void disableTotp()}
            disabled={totpLoading}
            className="flex items-center gap-2 px-4 py-2 border border-destructive text-destructive rounded-lg text-sm hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            <ShieldOff size={14} />
            Desactivar 2FA
          </button>
        )}
      </section>

      {/* ── PIN section ──────────────────────────────────────────────────────── */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <KeyRound size={20} className="text-primary shrink-0" />
          <div>
            <h3 className="text-sm font-semibold">Bloqueo por PIN</h3>
            <p className="text-xs text-muted-foreground">
              Bloquea la app automáticamente tras 10 min de inactividad
            </p>
          </div>
          <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${pinEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-muted text-muted-foreground'}`}>
            {pinEnabled ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        {!pinEnabled && pinStep === 'idle' && (
          <button
            onClick={() => setPinStep('set')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
          >
            <KeyRound size={14} />
            Configurar PIN
          </button>
        )}

        {pinStep !== 'idle' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {pinStep === 'set' ? 'Elegí un PIN numérico de 4+ dígitos' : 'Repetí el PIN para confirmar'}
            </p>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                value={pinStep === 'set' ? pin : pinConfirm}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '')
                  if (pinStep === 'set') setPin(val)
                  else setPinConfirm(val)
                  setPinError('')
                }}
                placeholder={pinStep === 'set' ? 'PIN' : 'Confirmar PIN'}
                className="w-full pr-10 px-3 py-2.5 border border-border rounded-lg text-[16px] bg-background focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {pinError && <p className="text-xs text-destructive">{pinError}</p>}
            <div className="flex gap-2">
              <button
                onClick={savePin}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
              >
                {pinStep === 'set' ? 'Siguiente' : 'Guardar PIN'}
              </button>
              <button
                onClick={() => { setPinStep('idle'); setPin(''); setPinConfirm(''); setPinError('') }}
                className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-accent"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {pinEnabled && pinStep === 'idle' && (
          <div className="flex gap-2">
            <button
              onClick={() => setPinStep('set')}
              className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent"
            >
              Cambiar PIN
            </button>
            <button
              onClick={removePin}
              className="px-4 py-2 border border-destructive text-destructive rounded-lg text-sm hover:bg-destructive/10"
            >
              Eliminar PIN
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
