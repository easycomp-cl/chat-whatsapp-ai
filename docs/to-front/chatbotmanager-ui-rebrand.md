# UI — EasyComp Chat Bot Manager (rebrand + dominio)

> **Repo:** `chat-whatsapp-ai-ui` (implementar allí; este doc es la spec desde backend).  
> **Dominio UI:** `https://chatbotmanager.easycomp.cl`  
> **Dominio API:** `https://api-chatbotmanager.easycomp.cl`

## Resumen

Rebrand a **EasyComp Chat Bot Manager** y retiro de la marca/dominio anterior. Backend emite headers `X-ChatBotManager-*` en webhooks de flujos.

## Archivos sugeridos (UI)

| Área | Archivos |
|------|----------|
| Marca | `src/components/brand/brand-name.tsx`, `logo.tsx`, `src/lib/legal/constants.ts` (`LEGAL_PRODUCT_NAME`) |
| Layout / SEO | `src/app/layout.tsx`, `src/lib/landing/metadata.ts` |
| Landing | `src/components/landing/*` — textos de producto |
| Legal | `politica-de-privacidad`, `eliminacion-de-datos`, `privacy-policy-content.tsx` |
| Inbox | `conversations-empty-state.tsx` → "Chat Bot Manager" / "EasyComp Chat Bot Manager" |
| Env | `.env.example`, Vercel: `BOT_API_BASE_URL`, `NEXT_PUBLIC_APP_URL` |
| Assets | Renombrar PNG/logo legacy → `chatbotmanager-*.png` (actualizar imports) |
| Hero 3D | Componentes hero 3D legacy → prefijo `ChatBotManager*` (refactor opcional) |
| Flows UI | `flow-webhook-settings.tsx` — headers `X-ChatBotManager-*` |

## Variables Vercel

```env
BOT_API_BASE_URL=https://api-chatbotmanager.easycomp.cl
NEXT_PUBLIC_APP_URL=https://chatbotmanager.easycomp.cl
```

## Dominios Vercel

1. Settings → Domains → `chatbotmanager.easycomp.cl` activo
2. **Eliminar** dominio legacy de la UI cuando el nuevo esté validado (no mantener ambos)

## Retirar marca legacy en UI

```bash
rg -i "conversai" .
```

Objetivo: **0 coincidencias** (textos, componentes, assets, env, docs).

## Dependencias de deploy

- DNS CNAME `chatbotmanager` → Vercel
- Backend en `api-chatbotmanager.easycomp.cl` (ver [migracion-dominio-chatbotmanager.md](../pending/migracion-dominio-chatbotmanager.md))

## Cómo probar

1. Login en `https://chatbotmanager.easycomp.cl`
2. Bandeja carga conversaciones (sin CORS / 404 en inbox)
3. Landing y legal muestran **EasyComp Chat Bot Manager**
4. `rg -i conversai` en repo UI → vacío
