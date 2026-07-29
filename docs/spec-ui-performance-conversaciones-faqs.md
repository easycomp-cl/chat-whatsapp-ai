# Spec UI — performance Conversaciones y FAQs

> **Backend:** cambios en `chat-whatsapp-ai` (este repo)  
> **UI:** implementar en `chat-whatsapp-ai-ui` según [cambios-ui-performance-conversaciones-faqs.md](../../chat-whatsapp-ai-ui/docs/cambios-ui-performance-conversaciones-faqs.md)

## Resumen

El backend expone un inbox optimizado (1 query SQL) y cache HTTP en FAQs. La UI debe consumir el nuevo endpoint, cachear FAQs en servidor y reducir polling Supabase redundante.

## Cambios backend (hechos)

| Cambio | Detalle |
|--------|---------|
| `GET /businesses/:businessId/conversations/inbox` | Lista con cliente + preview en una query |
| Índices BD | `Message(conversationId, createdAt DESC)`, `Message(tenantId, createdAt DESC)` |
| `chatClearedAt` en Prisma | Alineado con columna existente en `Conversation` |
| `GET .../faqs` | `Cache-Control: private, max-age=60` |
| Mutaciones FAQ | `Cache-Control: no-store` |

## Migración

```bash
npm run prisma:migrate
# o en Supabase: aplicar prisma/migrations/20260713010000_inbox_performance/migration.sql
```

## Deploy

1. Aplicar migración en Supabase (misma DB que Prisma).
2. Redeploy ECS con la nueva imagen.
3. UI: seguir doc del repo hermano y redeploy Vercel.

## Endpoint inbox

```http
GET /businesses/{businessId}/conversations/inbox?assigned_admin_id={opcional}&limit=100
X-API-Key: {INTERNAL_API_KEY}
```

Respuesta:

```json
{
  "conversations": [
    {
      "id": "cuid",
      "business_id": "...",
      "customer_id": "...",
      "status": "OPEN",
      "mode": "BOT",
      "last_message_at": "2026-07-13T...",
      "chat_cleared_at": null,
      "customers": {
        "id": "...",
        "business_id": "...",
        "phone_number": "+569...",
        "name": "Cliente"
      },
      "last_message_preview": "Hola"
    }
  ]
}
```

Cache HTTP: `max-age=5` (lista dinámica).

## Cómo probar backend

```bash
curl -s -H "X-API-Key: $INTERNAL_API_KEY" \
  "https://api.conversai.easycomp.cl/businesses/{id}/conversations/inbox" | jq '.conversations | length'

curl -sI -H "X-API-Key: $INTERNAL_API_KEY" \
  "https://api.conversai.easycomp.cl/businesses/{id}/faqs" | grep -i cache-control
```

Esperado FAQs: `Cache-Control: private, max-age=60, stale-while-revalidate=120`
