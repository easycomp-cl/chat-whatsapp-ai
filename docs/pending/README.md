# Pendientes — WhatsApp / Meta (producción)

Documentación para implementar en el futuro la conexión self-service de **WhatsApp Business** por cada empresa (tenant) en EasyComp ConversAI, y la integración de **Instagram DM** (Fase 3).

## Orden recomendado

| # | Documento | Estado | Descripción |
|---|---------|--------|-------------|
| 1 | [01-token-meta-permanente.md](./01-token-meta-permanente.md) | **Hacer primero** | Token de System User que no expire (piloto, scripts, fallback) |
| — | [03-conectar-numero-7544-piloto.md](./03-conectar-numero-7544-piloto.md) | **Guía práctica** | Conectar +56946867544 con scripts (sin pegar token en terminal) |
| 2 | [02-embedded-signup-whatsapp-business.md](./02-embedded-signup-whatsapp-business.md) | Pendiente | Flujo para que cada dueño conecte su número Business desde la app |
| 3 | [04-instagram-messaging.md](./04-instagram-messaging.md) | Pendiente | Instagram DM: requisitos Meta, infra, schema, código y onboarding |

## Contexto rápido

**Hoy (implementado):**

- Runtime multi-tenant: webhook → `phone_number_id` → tenant → bot → handoff
- Activación manual del canal: `POST /businesses/:id/whatsapp-accounts` o `scripts/link-whatsapp-staging.ps1`
- Token por tenant cifrado en `TenantChannel.accessTokenEncrypted`

**Falta (documentado en paso 2):**

- UI «Conectar WhatsApp Business»
- Meta Embedded Signup / OAuth
- Callback backend, intercambio de token, suscripción WABA al webhook
- Estados de conexión (`PENDING_WHATSAPP_CONNECTION`, etc.)

## Relación con otros docs del repo

| Doc | Relación |
|-----|----------|
| [META_WHATSAPP_PRUEBAS.md](../../META_WHATSAPP_PRUEBAS.md) | Pruebas locales con token temporal |
| [README_META_APP_PRUEBAS_LOCALES.md](../../README_META_APP_PRUEBAS_LOCALES.md) | Crear app Meta + ngrok |
| [docs/aws-migracion-paso-a-paso.md](../aws-migracion-paso-a-paso.md) | Deploy staging + vincular canal manual |
| [SPEC.md](../../SPEC.md) | Spec del bot (runtime ya alineado) |

## Dominios del proyecto

| Qué | URL |
|-----|-----|
| UI | `https://conversai.easycomp.cl` |
| API + webhook | `https://api.conversai.easycomp.cl` |
| Webhook WhatsApp | `https://api.conversai.easycomp.cl/webhooks/whatsapp` |
| Webhook Instagram (propuesto) | `https://api.conversai.easycomp.cl/webhooks/instagram` |
