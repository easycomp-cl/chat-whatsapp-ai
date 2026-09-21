# Backend — Persistencia del borrador de onboarding

**Estado:** implementado. Contrato alineado con el wizard UI (`current_step`, `draft_updated_at`, PATCH parcial).

## Qué quedó

- Tabla `TenantOnboardingDraft` (un JSON por tenant) + columnas `Tenant.logoUrl` y `Tenant.onboardingCompletedAt`.
- Compatibilidad: el draft también se escribe en `Tenant.metadataJson.setup` (complete, admin phone, tenants viejos).
- `GET /businesses/:id/setup-status` siempre devuelve `draft` (objeto, nunca `null`), `current_step` (1–5) y `draft_updated_at`.
- `PATCH /businesses/:id/onboarding` acepta subset incompleto (200). Merge por sección; `offerings` reemplaza el array.
- `logo_url` solo `https://`; `data:` / `blob:` se ignoran; `null` borra draft y `Tenant.logoUrl`.
- `checklist.*.done` y `progress_percent` usan las reglas de *complete*, no “hay JSON”.
- `POST .../onboarding/complete` valida go-live (409 + `missing_for_go_live`) y **no borra** el draft. Materializa nombre, tipo, logo, FAQs y KB.

## Pendiente (otro spec)

`POST /businesses/:id/logo` y `DELETE /businesses/:id/logo` — ver spec UI `backend-business-logo.md`. Hasta entonces la UI guarda el archivo como data URL solo en localStorage.

## Cómo probar

1. `PATCH` identity `{ "business_name": "Aurora" }` → 200, GET lo devuelve, `checklist.identity.done === false`.
2. `PATCH` `{ "current_step": 4 }` → GET `current_step === 4`.
3. `PATCH` offerings incompletos → 200, offerings `done: false`.
4. `POST complete` con draft a medias → 409; GET conserva el draft.
5. `PATCH` `logo_url: "data:image/png;base64,..."` → 200 y no persiste esa clave.
6. `PATCH` `logo_url` https → GET la devuelve.
7. Dos PATCH (nombre, luego descripción) → GET tiene ambos.
8. Complete OK → `completed_at` no nulo y `Tenant.name` / catálogo / FAQs materializados.

Migración: `prisma/migrations/20260917220000_onboarding_draft/`.
