# Plan — Rol Colaborador + módulo «Mi equipo»

> **Fecha:** 2026-07-28  
> **Repositorio UI:** `chat-whatsapp-ai-ui`  
> **Repositorio backend:** `chat-whatsapp-ai`  
> **Estado:** ✅ **Implementado** (2026-07-28) — `TenantAdmin.role` default `collaborator`, alias `agent` en API agents. Enum `profiles.role` en Supabase sigue en repo UI.

---

## 1. Problema

Hoy el producto mezcla términos que confunden:

| Término actual | Dónde | Problema |
|----------------|-------|----------|
| `AGENT` | `profiles.role`, código | Suena a agente de IA o call center |
| «Usuarios» | Nav `/app/users` | Genérico; no dice que es el equipo del negocio |
| Tabla `agents` | BD / bot API | Son contactos de derivación, no siempre usuarios con login |
| `agent_id` en `profiles` | BD | Vincula login con fila en `agents` |

El dueño de un emprendimiento piensa en **su equipo** (colaboradores), no en «agentes».

---

## 2. Objetivo

| Capa | Decisión |
|------|----------|
| **BD / API** | Rol de login `COLLABORATOR` (reemplaza `AGENT`) |
| **UI** | Módulo **«Mi equipo»**; persona = **miembro del equipo** / **colaborador** |
| **Bot / IA** | Seguir llamándose **asistente virtual** o **bot** — nunca «agente» |

---

## 3. Modelo de roles (login — tabla `profiles`)

### 3.1 Enum `UserRole` (propuesto)

```prisma
enum UserRole {
  SUPER_ADMIN
  BUSINESS_ADMIN
  COLLABORATOR   // antes AGENT
}
```

| Rol BD | Label UI | Descripción |
|--------|----------|-------------|
| `BUSINESS_ADMIN` | Administrador | Dueño o quien configura el negocio |
| `COLLABORATOR` | Colaborador | Atiende conversaciones; acceso limitado |
| `SUPER_ADMIN` | Super administrador | Consola EasyComp |

### 3.2 Migración

```sql
-- 1) Ampliar enum (Postgres)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'COLLABORATOR';

-- 2) Migrar filas existentes
UPDATE profiles SET role = 'COLLABORATOR' WHERE role = 'AGENT';

-- 3) Tras desplegar código que ya no usa AGENT, eliminar valor legacy del enum
-- (paso opcional en ventana de mantenimiento)
```

**Compatibilidad temporal:** la UI envía `AGENT` si el backend aún no tiene `COLLABORATOR` (`normalizeRoleForDb` en `src/lib/roles/labels.ts`). Tras migración, la UI puede enviar `COLLABORATOR` directamente.

### 3.3 Matriz RBAC (v1 acordada)

| Acción | BUSINESS_ADMIN | COLLABORATOR |
|--------|----------------|--------------|
| Dashboard, conversaciones | Sí | Sí |
| Atender / responder chats | Sí | Sí |
| Cambiar modo BOT/HUMAN | Sí | Sí |
| FAQs, conocimiento, catálogo, despachos | Sí | No |
| Configuración del negocio | Sí | No |
| **Mi equipo** (CRUD miembros) | Sí | No |
| Editar perfil CRM del contacto | Sí | No (solo lectura) |
| Limpiar chat de conversación | Sí | No |
| Auditoría mensajes editados/borrados | Sí | No |

Detalle perfil CRM: [backend-customer-profile-crm.md](./backend-customer-profile-crm.md).

---

## 4. Miembros del equipo (tabla `agents` → evolución)

### 4.1 Estado actual

- Tabla/API: `agents` (`BusinessAgent` en UI).
- Campos: `name`, `phone`, `role`, `notify_on_handoff`, `active`, `is_primary`.
- Uso: notificaciones de derivación; opcionalmente vinculado a login vía `profiles.agent_id`.

### 4.2 v1 (sin renombrar tabla aún)

- Mantener endpoints `/businesses/:id/agents` por compatibilidad.
- En respuestas JSON, documentar alias `team_member` en OpenAPI (opcional).
- Campo `role` en fila `agents`: valor `"collaborator"` en lugar de `"agent"` (migración de datos).

### 4.3 v2 (recomendado)

| Actual | Propuesto |
|--------|-----------|
| `agents` | `team_members` |
| `profiles.agent_id` | `profiles.team_member_id` |
| `POST /agents` | `POST /team-members` (redirect legacy 308) |

La UI ya muestra **«Mi equipo»**; la ruta puede seguir siendo `/app/users` o moverse a `/app/equipo` con redirect.

---

## 5. API propuesta

### 5.1 Perfiles (Supabase / auth)

`PATCH profiles` (super admin o admin futuro):

```json
{
  "role": "COLLABORATOR",
  "team_member_id": "uuid-opcional"
}
```

### 5.2 Miembros del equipo (bot API)

Mantener contrato actual; ampliar:

```json
{
  "name": "Camila",
  "phone": "+56912345678",
  "role": "collaborator",
  "notify_on_handoff": true,
  "active": true
}
```

**Futuro — invitación con login:**

```http
POST /businesses/:businessId/team-members/invite
{ "email": "camila@negocio.cl", "role": "COLLABORATOR" }
```

Crea usuario auth + profile + team_member en un flujo (fase posterior).

### 5.3 Validaciones

- Solo `BUSINESS_ADMIN` del mismo `business_id` crea/edita miembros.
- `COLLABORATOR` no puede elevar su propio rol.
- Un `team_member_id` solo puede vincularse a un `profile` del mismo tenant.

---

## 6. UI (ya aplicado / pendiente tras API)

| Elemento | Copy UI |
|----------|---------|
| Nav sidebar | **Mi equipo** |
| Página `/app/users` | Título «Mi equipo» |
| Rol en selects | Administrador / Colaborador |
| Toasts CRUD | «Miembro agregado al equipo» |
| Bot conversacional | Asistente virtual (sin cambio) |

**Archivos front:**

- `src/lib/roles/labels.ts` — etiquetas y normalización AGENT ↔ COLLABORATOR
- `src/lib/rbac.ts` — `isCollaborator()`
- `src/features/users/*` — copy «Mi equipo»

**Pendiente UI (cuando backend entregue invite + roles):**

- [ ] Listar perfiles con login + miembros sin login en una sola vista
- [ ] Invitar colaborador por email
- [ ] Badge de rol en tabla
- [ ] Ruta `/app/equipo` con redirect desde `/app/users`

---

## 7. Plan de implementación

### Fase 1 — Backend (prioridad)

- [ ] Migración enum `COLLABORATOR` + `UPDATE profiles`
- [ ] Aceptar `COLLABORATOR` en guards/middleware (tratar `AGENT` como alias temporal)
- [ ] `role: "collaborator"` en CRUD `agents`
- [ ] Documentar deprecación de `AGENT` en API

### Fase 2 — UI (parcialmente hecho)

- [x] Copy «Mi equipo» y «Colaborador»
- [x] Helpers de rol en `src/lib/roles/labels.ts`
- [ ] Ajustar tipos generados Supabase cuando exista `COLLABORATOR` en BD
- [ ] Quitar `normalizeRoleForDb` cuando backend solo use `COLLABORATOR`

### Fase 3 — Mi equipo completo

- [ ] Invitaciones, desactivar acceso, unificar login + contacto de derivación
- [ ] Renombrar tabla `agents` → `team_members` (opcional)

---

## 8. Relación con otros pendientes

| Documento | Relación |
|-----------|----------|
| [backend-customer-profile-crm.md](./backend-customer-profile-crm.md) | Solo admin edita perfil; colaborador lectura |
| [backend-whatsapp-delivery-status-read.md](./backend-whatsapp-delivery-status-read.md) | Sin cambio de roles |
| [backend-editar-mensaje-whatsapp.md](./backend-editar-mensaje-whatsapp.md) | Sin cambio de roles |

---

## 9. Resumen para backend

1. Renombrar rol de login **`AGENT` → `COLLABORATOR`** en `profiles.role`.
2. Mantener tabla `agents` en v1; valor `role` = `"collaborator"`.
3. RBAC: colaborador = conversaciones + dashboard; admin = todo lo demás + **Mi equipo**.
4. La UI ya dice **Mi equipo** / **Colaborador**; conviene desplegar migración de enum antes o en paralelo con alias `AGENT` en guards unos días.
