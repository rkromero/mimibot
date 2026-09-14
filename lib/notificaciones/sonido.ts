// Sonido corto de "mensaje nuevo", generado con WebAudio (sin archivo de
// audio). La preferencia se guarda por dispositivo en localStorage.

const CLAVE_SONIDO = 'alipro:notificaciones:sonido'

export function sonidoActivado(): boolean {
  try {
    return localStorage.getItem(CLAVE_SONIDO) !== '0'
  } catch {
    return true
  }
}

export function setSonidoActivado(on: boolean): void {
  try {
    localStorage.setItem(CLAVE_SONIDO, on ? '1' : '0')
  } catch {
    // sin storage (modo privado): queda el valor por defecto
  }
}

let ctx: AudioContext | null = null

function contexto(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx ??= new Ctor()
  return ctx
}

/**
 * Dos notas cortas, suaves. Si el navegador todavía no permite audio (no
 * hubo interacción del usuario) falla en silencio.
 */
export function reproducirSonidoMensaje(): void {
  const ac = contexto()
  if (!ac) return
  const tocar = () => {
    const t0 = ac.currentTime
    const notas: [number, number][] = [[880, 0], [1174.66, 0.12]]
    for (const [freq, offset] of notas) {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t0 + offset)
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + offset + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.22)
      osc.connect(gain).connect(ac.destination)
      osc.start(t0 + offset)
      osc.stop(t0 + offset + 0.25)
    }
  }
  if (ac.state === 'suspended') {
    ac.resume().then(tocar).catch(() => {})
  } else {
    try {
      tocar()
    } catch {
      // sin audio
    }
  }
}
