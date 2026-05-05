'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

type Message = { role: 'user' | 'assistant'; content: string }

export default function BotPreview({ systemPrompt }: { systemPrompt: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [handedOff, setHandedOff] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    const text = input.trim()
    if (!text || loading || handedOff) return

    const next: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/bot/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, systemPrompt }),
      })
      const data = await res.json() as { response: string; handoff: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error')

      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }])
      if (data.handoff) setHandedOff(true)
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Algo salió mal'}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setMessages([])
    setInput('')
    setLoading(false)
    setHandedOff(false)
  }

  return (
    <div className="flex flex-col h-[520px] border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-sm font-medium">Vista previa del bot</span>
        </div>
        <button
          onClick={reset}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Reiniciar
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-8">
            Escribí un mensaje para ver cómo responde el bot con el prompt actual.
          </p>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-muted text-foreground rounded-bl-sm',
              )}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-sm px-3.5 py-2.5">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        {handedOff && (
          <div className="flex justify-center">
            <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1 rounded-full">
              El bot hizo handoff — listo para agente humano
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
          disabled={loading || handedOff}
          placeholder={handedOff ? 'Conversación finalizada — Reiniciá para probar de nuevo' : 'Escribí como si fueras el lead...'}
          className={cn(
            'flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background',
            'focus:outline-none focus:ring-1 focus:ring-ring',
            'disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-muted-foreground',
          )}
        />
        <button
          onClick={() => void send()}
          disabled={loading || handedOff || !input.trim()}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90 transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          Enviar
        </button>
      </div>
    </div>
  )
}
