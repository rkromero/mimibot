-- Teléfonos al formato de WhatsApp (+549 + área + número).
--
-- El intake de landings guardaba los teléfonos como +54 11 ... (sin el 9 de
-- celular), pero WhatsApp manda los mensajes desde +54 9 11 .... El webhook
-- busca la conversación por igualdad de teléfono, no la encontraba y creaba
-- contacto + lead + conversación nuevos: la respuesta del lead quedaba en un
-- lead "whatsapp" sin las notas del formulario ni la plantilla enviada.
--
-- 1) Fusión de duplicados: por cada contacto +54... (original, del landing)
--    que tenga su gemelo +549... (creado por el webhook) se mueven los
--    mensajes y todo lo que cuelga del lead duplicado al lead original, se
--    conservan notas/producto/asignación del original (completando con el
--    duplicado si faltan) y se borra el duplicado.
-- 2) Normalización: el resto de contactos y conversaciones +54... pasan a +549....
DO $$
DECLARE
  r RECORD;
  lead_orig uuid;
  lead_dup uuid;
  conv_orig uuid;
  conv_dup uuid;
BEGIN
  FOR r IN
    SELECT o.id AS orig_id, d.id AS dup_id
    FROM contacts o
    JOIN contacts d ON d.phone = '+549' || substr(o.phone, 4)
    WHERE o.phone LIKE '+54%' AND o.phone NOT LIKE '+549%'
  LOOP
    FOR lead_dup IN SELECT id FROM leads WHERE contact_id = r.dup_id LOOP
      SELECT id INTO lead_orig FROM leads
      WHERE contact_id = r.orig_id AND deleted_at IS NULL
      ORDER BY created_at LIMIT 1;

      IF lead_orig IS NULL THEN
        -- El original no tiene lead vigente: el lead duplicado pasa al contacto original.
        UPDATE leads SET contact_id = r.orig_id, updated_at = NOW() WHERE id = lead_dup;
        CONTINUE;
      END IF;

      SELECT id INTO conv_orig FROM conversations WHERE lead_id = lead_orig LIMIT 1;
      SELECT id INTO conv_dup FROM conversations WHERE lead_id = lead_dup LIMIT 1;

      IF conv_dup IS NOT NULL THEN
        IF conv_orig IS NULL THEN
          UPDATE conversations SET lead_id = lead_orig, updated_at = NOW() WHERE id = conv_dup;
        ELSE
          UPDATE messages SET conversation_id = conv_orig WHERE conversation_id = conv_dup;
          UPDATE conversations c SET
            last_message_at = GREATEST(c.last_message_at, d.last_message_at),
            unread_count = c.unread_count + d.unread_count,
            wa_phone_number_id = COALESCE(c.wa_phone_number_id, d.wa_phone_number_id),
            updated_at = NOW()
          FROM conversations d
          WHERE c.id = conv_orig AND d.id = conv_dup;
          DELETE FROM conversations WHERE id = conv_dup;
        END IF;
      END IF;

      UPDATE activity_log SET lead_id = lead_orig WHERE lead_id = lead_dup;
      UPDATE propuestas SET lead_id = lead_orig WHERE lead_id = lead_dup;
      UPDATE clientes SET lead_id = lead_orig WHERE lead_id = lead_dup;
      UPDATE pedidos SET lead_id = lead_orig WHERE lead_id = lead_dup;
      INSERT INTO lead_tags (lead_id, tag_id)
        SELECT lead_orig, tag_id FROM lead_tags WHERE lead_id = lead_dup
        ON CONFLICT DO NOTHING;
      DELETE FROM lead_tags WHERE lead_id = lead_dup;

      UPDATE leads o SET
        notes = COALESCE(o.notes, d.notes),
        product_interest = COALESCE(o.product_interest, d.product_interest),
        assigned_to = COALESCE(o.assigned_to, d.assigned_to),
        last_contacted_at = GREATEST(o.last_contacted_at, d.last_contacted_at),
        updated_at = NOW()
      FROM leads d
      WHERE o.id = lead_orig AND d.id = lead_dup;

      DELETE FROM leads WHERE id = lead_dup;
    END LOOP;

    DELETE FROM contacts WHERE id = r.dup_id;
  END LOOP;
END $$;--> statement-breakpoint
UPDATE contacts SET phone = '+549' || substr(phone, 4), updated_at = NOW()
WHERE phone LIKE '+54%' AND phone NOT LIKE '+549%';--> statement-breakpoint
UPDATE conversations SET wa_contact_phone = '+549' || substr(wa_contact_phone, 4), updated_at = NOW()
WHERE wa_contact_phone LIKE '+54%' AND wa_contact_phone NOT LIKE '+549%';
