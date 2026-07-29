# Pendientes — WhatsApp / Meta (producción)

Documentación para implementar en el futuro la conexión self-service de **WhatsApp Business** por cada empresa (tenant) en EasyComp ConversAI, y la integración de **Instagram DM** (Fase 3).

## Orden recomendado

| # | Documento | Estado | Descripción |
|---|---------|--------|-------------|
| 1 | [01-token-meta-permanente.md](./01-token-meta-permanente.md) | **Guía ops** | Token de System User que no expire (piloto, scripts, fallback) |
| — | [03-conectar-numero-7544-piloto.md](./03-conectar-numero-7544-piloto.md) | **Guía práctica** | Conectar +56946867544 con scripts (sin pegar token en terminal) |
| 2 | [02-embedded-signup-whatsapp-business.md](./02-embedded-signup-whatsapp-business.md) | **Pendiente** | Flujo para que cada dueño conecte su número Business desde la app |
| 3 | [04-instagram-messaging.md](./04-instagram-messaging.md) | **Pendiente** | Instagram DM: requisitos Meta, infra, schema, código y onboarding |

## Backend pendiente (specs UI)

| Documento | Estado |
|-----------|--------|
| [flows-backend-mvp.md](./flows-backend-mvp.md) | **PR4 listo** — motor + pricing catálogo/delivery |
| [flows-supabase-storage.md](./flows-supabase-storage.md) | **Pendiente deploy** — bucket `flow-files` |
| [whatsapp-media-ui.md](../to-front/whatsapp-media-ui.md) | **Backend listo** — imágenes/PDF en chat; spec para UI |
| [ConversAI_Especificacion_Modulo_Flujos.md](./ConversAI_Especificacion_Modulo_Flujos.md) | Spec completa (referencia) |

## Contexto rápido

**Hoy (implementado):**

- Runtime multi-tenant: webhook → `phone_number_id` → tenant → bot → handoff
- Activación manual del canal: `POST /businesses/:id/whatsapp-accounts` o `scripts/link-whatsapp-staging.ps1`
- Token por tenant cifrado en `TenantChannel.accessTokenEncrypted`
- Estados entrega WhatsApp (`DELIVERED`/`READ`), webhooks edit/revoke del cliente, inbox optimizado, perfil CRM de contacto, rol `collaborator` en agents

**Falta (documentado en paso 2 y 4):**

- UI «Conectar WhatsApp Business» + Embedded Signup / OAuth
- Instagram DM (canal, webhooks, onboarding)

## Relación con otros docs del repo

| Doc | Relación |
|-----|----------|
| [META_WHATSAPP_PRUEBAS.md](../../META_WHATSAPP_PRUEBAS.md) | Pruebas locales con token temporal |
| [README_META_APP_PRUEBAS_LOCALES.md](../../README_META_APP_PRUEBAS_LOCALES.md) | Crear app Meta + ngrok |
| [docs/aws-migracion-paso-a-paso.md](../aws-migracion-paso-a-paso.md) | Deploy staging + vincular canal manual |
| [docs/done/](../done/) | Specs backend/UI ya implementadas o cerradas |
| [SPEC.md](../../SPEC.md) | Spec del bot (runtime ya alineado) |

## Dominios del proyecto

| Qué | URL |
|-----|-----|
| UI | `https://conversai.easycomp.cl` |
| API + webhook | `https://api.conversai.easycomp.cl` |
| Webhook WhatsApp | `https://api.conversai.easycomp.cl/webhooks/whatsapp` |
| Webhook Instagram (propuesto) | `https://api.conversai.easycomp.cl/webhooks/instagram` |
