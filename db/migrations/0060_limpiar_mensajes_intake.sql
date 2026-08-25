-- Limpieza: el intake de landings insertaba un mensaje entrante FALSO con el
-- resumen del formulario para que el lead apareciera en el inbox. Eso ya no se
-- hace (el lead entra al inbox recién cuando alguien escribe). Se borran esos
-- mensajes -entrantes sin wa_message_id, que solo genera el intake; los de
-- WhatsApp reales siempre lo tienen- y se recalculan last_message_at y
-- unread_count de las conversaciones afectadas a partir de los mensajes que quedan.
-- El texto no se pierde: es el mismo resumen guardado en las notas del lead.
CREATE TEMP TABLE _conv_intake AS
  SELECT DISTINCT conversation_id FROM messages
  WHERE direction = 'inbound' AND wa_message_id IS NULL;--> statement-breakpoint
DELETE FROM messages WHERE direction = 'inbound' AND wa_message_id IS NULL;--> statement-breakpoint
UPDATE conversations c SET
  last_message_at = (SELECT MAX(m.sent_at) FROM messages m WHERE m.conversation_id = c.id),
  unread_count = (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.direction = 'inbound' AND m.is_read = false),
  updated_at = NOW()
WHERE c.id IN (SELECT conversation_id FROM _conv_intake);--> statement-breakpoint
DROP TABLE _conv_intake;
