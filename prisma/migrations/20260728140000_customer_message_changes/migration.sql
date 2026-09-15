-- Snapshot del texto del cliente antes de editar/borrar en WhatsApp (auditoría admin).

ALTER TABLE public."Message"
  ADD COLUMN IF NOT EXISTS "contentTextSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "customerEditedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "customerRevokedAt" TIMESTAMP(3);
