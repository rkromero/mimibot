'use client'

import { useState, useRef, useTransition } from 'react'
import { Send, Paperclip } from 'lucide-react'
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
      const endpoint = isNote
        ? `/api/conversations/${conversationId}/messages`
        : `/api/whatsapp/send`

      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isNote
            ? { body: trimmed, contentType: 'internal_note', conversationId }
            : { conversationId, leadId, body: trimmed },
        ),
      })

      setText('')
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
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
    <div className="border-t border-border bg-background shrink-0">
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
            'flex-1 resize-none px-3 py-2 text-sm rounded-md border',
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
