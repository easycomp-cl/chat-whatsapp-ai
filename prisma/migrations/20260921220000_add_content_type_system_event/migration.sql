-- Valor de enum usado por los globos SYSTEM. Prisma corre ADD VALUE
-- fuera de transacción; IF NOT EXISTS es idempotente.
ALTER TYPE "ContentType" ADD VALUE IF NOT EXISTS 'SYSTEM_EVENT';
