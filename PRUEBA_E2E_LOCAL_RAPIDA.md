# Prueba End-to-End Rápida en Ambiente Local

Esta guía es la versión corta para hacer una prueba completa de punta a punta en local.

Objetivo:

- levantar el backend
- exponerlo a internet
- conectar el webhook de Meta
- enviar un mensaje de WhatsApp
- confirmar que el bot responde

## 1. Lo mínimo que debes tener listo

Antes de empezar, asegúrate de tener:

- Node.js instalado
- PostgreSQL corriendo
- una app en Meta con el producto `WhatsApp`
- un `Phone Number ID`
- un token de acceso de Meta
- una URL pública HTTPS para el webhook

## 2. Instala y prepara el proyecto

Instala dependencias:

```bash
npm.cmd install
```

Crea el `.env`:

```bash
copy .env.example .env
```

Edita `.env` y completa como mínimo:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/whatsapp_ai_saas
WHATSAPP_VERIFY_TOKEN=mi_token_seguro
WHATSAPP_ACCESS_TOKEN_EASYCOMP=TU_TOKEN_DE_META
OPENAI_API_KEY=TU_OPENAI_API_KEY
OPENAI_MODEL=gpt-4.1-mini
EASYCOMP_PHONE_NUMBER=+56911111111
EASYCOMP_PHONE_NUMBER_ID=TU_PHONE_NUMBER_ID
```

## 3. Prepara la base de datos

Ejecuta migraciones:

```bash
npx prisma migrate deploy
```

Genera Prisma:

```bash
npx prisma generate
```

Carga datos de ejemplo:

```bash
npm run prisma:seed
```

## 4. Levanta el backend

Inicia el servidor:

```bash
npm run dev
```

Si todo va bien, debería quedar disponible en algo como:

```text
http://localhost:3000
```

Prueba salud:

```text
http://localhost:3000/health
```

Debe responder con algo tipo:

```json
{"ok":true}
```

## 5. Expón tu servidor local a internet

Necesitas una URL pública HTTPS porque Meta no puede llamar a `localhost`.

Con `ngrok`, por ejemplo:

```bash
ngrok http 3000
```

Eso te dará una URL parecida a:

```text
https://abc123.ngrok-free.app
```

Tu webhook final será:

```text
https://abc123.ngrok-free.app/webhooks/whatsapp
```

## 6. Configura el webhook en Meta

En `Meta for Developers`:

1. Entra a tu app.
2. Ve a `WhatsApp`.
3. Abre la configuración de `Webhooks`.
4. Usa como `Callback URL`:

```text
https://abc123.ngrok-free.app/webhooks/whatsapp
```

5. Usa como `Verify Token` exactamente el mismo valor que pusiste en:

```env
WHATSAPP_VERIFY_TOKEN=mi_token_seguro
```

6. Verifica y guarda.
7. Asegúrate de suscribirte al campo:

```text
messages
```

## 7. Haz la prueba más simple

Tienes dos caminos:

### Opción A. Probar onboarding con el número EasyComp

Envía desde tu WhatsApp un mensaje al número configurado como EasyComp:

```text
START
```

Si el flujo está bien, el backend debería responder con la primera pregunta del onboarding.

### Opción B. Probar un tenant ya cargado por seed

Usa uno de los tenants del seed, pero recuerda:

- debes tener configurado en Meta el `phone_number_id` correcto
- el token de WhatsApp debe ser válido para ese número

Luego envía un mensaje al número del negocio, por ejemplo:

```text
Hola, ¿qué servicios tienen?
```

Si todo está bien:

- Meta enviará el mensaje a tu webhook
- el backend lo procesará
- el bot responderá por la Cloud API

## 8. Cómo saber si funcionó

La prueba salió bien si ocurre esto:

1. Meta acepta la verificación del webhook.
2. Tu endpoint `POST /webhooks/whatsapp` recibe el mensaje.
3. En la consola del backend ves actividad.
4. El usuario recibe una respuesta por WhatsApp.

## 9. Si falla, revisa esto primero

Checklist rápido:

- el backend está corriendo
- `localhost:3000/health` responde
- `ngrok` sigue activo
- la URL del webhook en Meta apunta a `/webhooks/whatsapp`
- el `Verify Token` coincide exactamente
- el `Phone Number ID` es correcto
- el token de Meta sigue vigente
- el campo `messages` está suscrito

## 10. La prueba mínima ideal

Si quieres validar solo lo esencial, haz esto:

1. `npm.cmd install`
2. completa `.env`
3. `npx prisma migrate deploy`
4. `npx prisma generate`
5. `npm run prisma:seed`
6. `npm run dev`
7. `ngrok http 3000`
8. configura webhook en Meta
9. envía `START` por WhatsApp
10. confirma que llega respuesta

## 11. Qué valida esta prueba

Con esta prueba verificas:

- backend funcionando
- base de datos conectada
- webhook de Meta funcionando
- recepción de mensajes
- procesamiento del router
- respuesta saliente por WhatsApp

Después de esto ya tiene sentido probar:

- onboarding completo
- runtime por tenant
- handoff humano
- comandos admin
