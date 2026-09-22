-- Plantilla (con encabezado de documento) para mandar la proforma del pedido
-- cuando la ventana de 24 hs de WhatsApp está cerrada. Ver
-- lib/pedidos/enviar-documento-whatsapp.ts. Aditiva e idempotente.
ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "proforma_template_name" text;
--> statement-breakpoint
ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "proforma_template_lang" text;
