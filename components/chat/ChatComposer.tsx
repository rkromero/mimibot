'use client'

import { useState, useRef, useTransition } from 'react'
import { Send, Paperclip, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'

type Props = {
  conversationId: string
  leadId: string
}

export default function ChatComposer({ conversationId, leadId }: Props) {
  const [text, setText] = useState('')
  const [isPending, startTransition] = useTransition()
  const [isNote, setIsNote] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [templateNotice, setTemplateNotice] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || isPending) return

    startTransition(async () => {
      setSendError(null)
      setTemplateNotice(false)

      if (isNote) {
        await fetch(`/api/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: trimmed, contentType: 'internal_note', conversationId }),
        })
        setText('')
        void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
        return
      }

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, leadId, body: trimmed }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string; code?: string }
        if (data.code === 'WINDOW_CLOSED_NO_TEMPLATE') {
          setSendError(data.error ?? 'Han pasado más de 24h. Configurá una plantilla de apertura en Sistema → WhatsApp.')
        }
        return
      }

      const data = await res.json() as { sentAsTemplate?: boolean }
      setText('')
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
      if (data.sentAsTemplate) {
        setTemplateNotice(true)
        setTimeout(() => setTemplateNotice(false), 6000)
      }
    })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const fd = new FormData()
    fd.append('file', file)
    fd.append('conversationId', conversationId)
    fd.append('leadId', leadId)

    await fetch('/api/whatsapp/send', { method: 'POST', body: fd })
    void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
    e.target.value = ''
  }

  return (
    <div className="border-t border-border bg-background shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {sendError && (
        <div className="flex items-start gap-2 px-3 pt-2 pb-1">
          <AlertCircle size={14} className="text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive leading-snug">{sendError}</p>
        </div>
      )}
      {templateNotice && (
        <div className="px-3 pt-2 pb-1">
          <p className="text-xs text-blue-600 dark:text-blue-400">Conversación abierta con plantilla de apertura.</p>
        </div>
      )}
      {/* Tabs: WhatsApp / Nota interna */}
      <div className="flex gap-1 px-3 pt-2">
        <button
          onClick={() => setIsNote(false)}
          className={cn(
            'px-3 py-1 text-xs rounded-t-md transition-colors duration-100',
            !isNote
              ? 'bg-accent text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          WhatsApp
        </button>
        <button
          onClick={() => setIsNote(true)}
          className={cn(
            'px-3 py-1 text-xs rounded-t-md transition-colors duration-100',
            isNote
              ? 'bg-accent text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Nota interna
        </button>
      </div>

      <div className="flex items-end gap-2 px-3 py-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isNote ? 'Escribir nota interna...' : 'Escribir mensaje de WhatsApp...'}
          rows={2}
          className={cn(
            'flex-1 resize-none px-3 py-2 text-base rounded-md border',
            'border-border bg-background text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
            isNote && 'bg-amber-50/50 dark:bg-amber-950/20',
          )}
        />
        <div className="flex flex-col gap-1.5">
          {!isNote && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,application/pdf,audio/*"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors duration-100"
                title="Adjuntar archivo"
              >
                <Paperclip size={15} />
              </button>
            </>
          )}
          <button
            onClick={handleSend}
            disabled={!text.trim() || isPending}
            className={cn(
              'p-1.5 rounded-md transition-colors duration-100',
              text.trim() && !isPending
                ? 'text-primary hover:bg-accent'
                : 'text-muted-foreground cursor-not-allowed',
            )}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
