-- Default de plataforma: GPT-5.6 Luna.
-- EasyComp Piloto pasa a Luna; el resto de tenants conserva su modelo actual.

ALTER TABLE "Tenant" ALTER COLUMN "defaultAiModel" SET DEFAULT 'gpt-5.6-luna';

UPDATE "Tenant"
SET "defaultAiModel" = 'gpt-5.6-luna'
WHERE slug IN ('easycomp-piloto', 'easycomp-repuestos');
