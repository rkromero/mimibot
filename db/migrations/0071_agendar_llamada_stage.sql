-- Etapa "Llamada" del pipeline con slug fijo 'agendar-llamada': el botón
-- "Agendar llamada" del panel del lead (a la derecha de "Cotizar") mueve el
-- lead acá. Idempotente: si ya hay una etapa con ese slug no hace nada.
--
-- Si existe una etapa abierta llamada "Llamada" o "Agendar llamada" (creada a
-- mano desde Configuración > Pipeline, con slug con timestamp), le fija el
-- slug para reutilizarla en vez de duplicarla. Si no existe, la crea justo
-- antes de las etapas terminales.
DO $$
DECLARE
  pos integer;
  existente uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE slug = 'agendar-llamada') THEN
    SELECT id INTO existente
    FROM pipeline_stages
    WHERE is_terminal = false
      AND lower(trim(name)) IN ('llamada', 'agendar llamada')
    ORDER BY position
    LIMIT 1;

    IF existente IS NOT NULL THEN
      UPDATE pipeline_stages
      SET slug = 'agendar-llamada', updated_at = now()
      WHERE id = existente;
    ELSE
      SELECT MIN(position) INTO pos FROM pipeline_stages WHERE is_terminal = true;
      IF pos IS NULL THEN
        SELECT COALESCE(MAX(position), -1) + 1 INTO pos FROM pipeline_stages;
      END IF;

      UPDATE pipeline_stages SET position = position + 1 WHERE position >= pos;

      INSERT INTO pipeline_stages (name, slug, position, color, is_terminal, is_won, is_deletable)
      VALUES ('Agendar llamada', 'agendar-llamada', pos, '#22c55e', false, false, true);
    END IF;
  END IF;
END $$;
