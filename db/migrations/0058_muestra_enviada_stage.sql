-- Etapa "Muestra enviada" del pipeline: el lead pasa acá automáticamente al
-- cargar el pedido de muestra CDA desde el panel del lead. Idempotente: si ya
-- existe la etapa (por slug) no hace nada. Se ubica justo después de
-- "Propuesta" (slug 'propuesta') o, si no está, antes de las etapas terminales.
DO $$
DECLARE
  pos integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE slug = 'muestra-enviada') THEN
    SELECT position + 1 INTO pos FROM pipeline_stages WHERE slug = 'propuesta';
    IF pos IS NULL THEN
      SELECT MIN(position) INTO pos FROM pipeline_stages WHERE is_terminal = true;
    END IF;
    IF pos IS NULL THEN
      SELECT COALESCE(MAX(position), -1) + 1 INTO pos FROM pipeline_stages;
    END IF;

    UPDATE pipeline_stages SET position = position + 1 WHERE position >= pos;

    INSERT INTO pipeline_stages (name, slug, position, color, is_terminal, is_won, is_deletable)
    VALUES ('Muestra enviada', 'muestra-enviada', pos, '#0ea5e9', false, false, true);
  END IF;
END $$;
