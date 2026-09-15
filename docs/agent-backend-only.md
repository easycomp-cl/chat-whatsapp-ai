# Alcance del agente — solo backend

Este repositorio (`chat-whatsapp-ai`) es **backend**. El front está en `chat-whatsapp-ai-ui`.

## Regla

1. El agente **no debe editar** archivos en `chat-whatsapp-ai-ui`.
2. Cambios de UI → documentar en `docs/pending/` (contrato, campos, endpoints) o en `chat-whatsapp-ai-ui/docs/cambios-ui-*.md` cuando el usuario lo pida.
3. Implementar aquí: API, Prisma, webhooks, workers, migraciones Postgres del backend.

Cursor: ver también `.cursor/rules/backend-only-no-ui-edits.mdc` (local; puede estar en `.gitignore`).
