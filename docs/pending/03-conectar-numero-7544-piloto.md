# Conectar número 7544 + token (piloto)

**No pegues el token en chat, Git ni tickets.** Solo en `.env.production` local y AWS Secrets Manager.

## 1. Guardar el token nuevo

En `.env.production`, reemplaza la línea:

```env
META_SYSTEM_USER_ACCESS_TOKEN=tu_token_nuevo_del_system_user
```

Si es el mismo token que ya tenías, no cambies nada.

## 2. Obtener Phone number ID

Meta Developers → **WhatsApp** → **API Setup** (o WhatsApp Manager → número `+56 9 4686 7544`).

Copia el **Phone number ID** (número largo, no el teléfono).

## 3. Validar token + número

```powershell
cd c:\Users\ISRAEL\Desktop\EasyComp\Projects\chat-whatsapp-ai

.\scripts\test-whatsapp-token.ps1 -PhoneNumberId "TU_PHONE_NUMBER_ID"
```

Debe mostrar `display_phone_number` con el 7544.

## 4. API encendida

El script llama a `https://api.conversai.easycomp.cl`. Si falla DNS o timeout:

- Enciende ECS staging (`aws-staging-start` si lo tienes).
- O apunta a local: `-ApiBase "http://localhost:3000"` con `npm run dev`.

## 5. Vincular canal al tenant

Tu `.env.production` tiene `TENANT_ID=tenant-twd` (negocio piloto del seed).

```powershell
.\scripts\link-whatsapp-staging.ps1 `
  -PhoneNumberId "TU_PHONE_NUMBER_ID" `
  -PhoneNumber "+56946867544"
```

El token se lee de `.env.production`. No hace falta `-AccessToken` en la línea de comandos.

## 6. AWS Secrets (recomendado)

En Secrets Manager, actualiza `META_SYSTEM_USER_ACCESS_TOKEN` con el mismo token y reinicia ECS.

## 7. Probar

1. Desde tu WhatsApp **4977**, envía **Hola** al **+56 9 4686 7544**.
2. Abre **https://conversai.easycomp.cl/app/conversations** (login del negocio `tenant-twd`).

## Perfil UI ↔ tenant

El usuario en Supabase `profiles.business_id` debe ser `tenant-twd` (o el id del tenant que vinculaste).

## Roles en la prueba

| Número | Rol |
|--------|-----|
| **7544** | Empresa (canal Meta + EasyComp) |
| **4977** | Cliente que escribe al 7544 |
