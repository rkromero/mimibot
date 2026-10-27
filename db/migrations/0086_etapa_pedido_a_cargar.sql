-- Etapa "Pedido a cargar" del pipeline: el lead pasa acá automáticamente
-- cuando el bot toma las cantidades del primer pedido (modo post-propuesta),
-- y queda ahí hasta que el vendedor carga el pedido y lo pasa a Ganado.
-- Idempotente: si ya existe la etapa (por slug) no hace nada. Se ubica justo
-- después de "Muestra enviada" (o de "Propuesta" si no está), o antes de las
-- etapas terminales.
DO $$
DECLARE
  pos integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE slug = 'pedido-a-cargar') THEN
    SELECT position + 1 INTO pos FROM pipeline_stages WHERE slug = 'muestra-enviada';
    IF pos IS NULL THEN
      SELECT position + 1 INTO pos FROM pipeline_stages WHERE slug = 'propuesta';
    END IF;
    IF pos IS NULL THEN
      SELECT MIN(position) INTO pos FROM pipeline_stages WHERE is_terminal = true;
    END IF;
    IF pos IS NULL THEN
      SELECT COALESCE(MAX(position), -1) + 1 INTO pos FROM pipeline_stages;
    END IF;

    UPDATE pipeline_stages SET position = position + 1 WHERE position >= pos;

    INSERT INTO pipeline_stages (name, slug, position, color, is_terminal, is_won, is_deletable)
    VALUES ('Pedido a cargar', 'pedido-a-cargar', pos, '#16a34a', false, false, true);
  END IF;
END $$;
