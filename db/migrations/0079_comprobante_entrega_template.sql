-- Plantilla (con encabezado de imagen) para mandar el comprobante de entrega
-- (foto del remito firmado o firma del cliente) cuando la ventana de 24 hs
-- de WhatsApp está cerrada. Ver lib/pedidos/enviar-comprobante-whatsapp.ts.
-- Aditiva e idempotente.
ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "comprobante_template_name" text;
--> statement-breakpoint
ALTER TABLE "whatsapp_config" ADD COLUMN IF NOT EXISTS "comprobante_template_lang" text;
