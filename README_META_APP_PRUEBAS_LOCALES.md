# Crear una App Nueva en Meta y Configurarla para Pruebas Locales

Esta guía está pensada para este proyecto y para un objetivo concreto:

- crear una app nueva en Meta
- activar WhatsApp Cloud API
- conectar el webhook al backend local
- hacer una prueba real de envío y recepción de mensajes

## Objetivo final

Al terminar deberías tener:

- una app nueva en Meta
- el producto `WhatsApp` activo
- un número de prueba o número conectado
- un `phone_number_id`
- un token de acceso válido
- un webhook apuntando a tu backend local expuesto con `ngrok`

## 1. Prerrequisitos

Antes de empezar, necesitas:

- una cuenta en `Meta for Developers`
- acceso a un `Meta Business Portfolio`
- este proyecto ya funcionando localmente
- PostgreSQL y Prisma ya listos
- el backend levantado con `npm run dev`
- `ngrok` o una alternativa para exponer tu `localhost`

Si todavía no levantaste el proyecto, primero usa:

- [README.md](/C:/Users/ISRAEL/Desktop/EasyComp/Projects/chat-whatsapp-ai/README.md)
- [PRUEBA_E2E_LOCAL_RAPIDA.md](/C:/Users/ISRAEL/Desktop/EasyComp/Projects/chat-whatsapp-ai/PRUEBA_E2E_LOCAL_RAPIDA.md)

## 2. Crear la app nueva en Meta

1. Entra a [Meta for Developers](https://developers.facebook.com/apps/).
2. Haz clic en `Create App`.
3. Elige una app de tipo negocio.
4. Completa:
   - nombre de la app
   - email de contacto
   - business account o portfolio asociado
5. Crea la app.

Si la interfaz cambió un poco, la idea sigue siendo la misma: debes terminar con una app de Meta asociada a un negocio.

## 3. Agregar el producto WhatsApp

Dentro de la app:

1. Busca la sección `Add products`.
2. Agrega `WhatsApp`.
3. Entra a `WhatsApp > Quickstart` o `WhatsApp > Getting Started`.

Ahí Meta normalmente te muestra los recursos iniciales para pruebas.

## 4. Usar recursos de prueba de Meta

Para pruebas locales rápidas, lo más práctico es usar los recursos de prueba que Meta crea al comenzar.

Normalmente verás algo como:

- `Temporary access token`
- `Phone number ID`
- `WhatsApp Business Account ID`
- `test phone number`

Guarda al menos estos datos:

- `Temporary access token`
- `Phone number ID`

## 5. Preparar el backend local

Debes tener el backend corriendo:

```bash
npm run dev
```

Y en otra terminal, expón tu puerto local:

```bash
ngrok http 3000
```

Eso te dará una URL como esta:

```text
https://abc123.ngrok-free.app
```

Tu webhook completo será:

```text
https://abc123.ngrok-free.app/webhooks/whatsapp
```

## 6. Configurar `.env` para esta app nueva

En tu `.env`, configura como mínimo:

```env
WHATSAPP_VERIFY_TOKEN=un_token_que_tu_elijas
WHATSAPP_ACCESS_TOKEN_EASYCOMP=TOKEN_TEMPORAL_DE_META
EASYCOMP_PHONE_NUMBER_ID=PHONE_NUMBER_ID_DE_META
EASYCOMP_PHONE_NUMBER=NUMERO_DE_PRUEBA_O_NUMERO_VISIBLE
```

### Qué significa cada uno

- `WHATSAPP_VERIFY_TOKEN`
  - es un texto que tú defines y luego copias igual en Meta al configurar el webhook
- `WHATSAPP_ACCESS_TOKEN_EASYCOMP`
  - es el token de acceso que te entrega Meta
- `EASYCOMP_PHONE_NUMBER_ID`
  - es el `Phone number ID` del número que usarás para pruebas
- `EASYCOMP_PHONE_NUMBER`
  - es el número asociado a ese recurso, en formato internacional

## 7. Configurar el webhook en Meta

En la app de Meta:

1. Ve a la configuración de `Webhooks`.
2. Define el `Callback URL` como:

```text
https://abc123.ngrok-free.app/webhooks/whatsapp
```

3. Define el `Verify Token` con exactamente el mismo valor que pusiste en:

```env
WHATSAPP_VERIFY_TOKEN=un_token_que_tu_elijas
```

4. Haz clic en verificar y guardar.

Si la verificación sale bien, significa que Meta pudo llamar a:

- `GET /webhooks/whatsapp`

del backend local expuesto.

## 8. Suscribirse al campo correcto

Después de configurar el webhook, asegúrate de suscribirte al menos a:

- `messages`

Eso es importante porque este proyecto procesa mensajes entrantes desde:

- `POST /webhooks/whatsapp`

## 9. Hacer la primera prueba real

Con todo lo anterior listo:

1. Envía un mensaje por WhatsApp al número de prueba o número conectado.
2. Prueba por ejemplo con:

```text
START
```

Si estás usando el número definido como EasyComp, ese mensaje debería entrar al flujo de onboarding.

También puedes probar:

```text
Hola
```

Lo importante en esta primera prueba no es tanto el contenido, sino verificar que:

- Meta entrega el webhook
- el backend lo recibe
- el backend responde usando Cloud API

## 10. Cómo confirmar que sí funcionó

La prueba salió bien si ves esto:

- Meta aceptó la verificación del webhook
- el backend sigue respondiendo en `http://localhost:3000/health`
- `ngrok` muestra requests entrantes
- al enviar un mensaje desde WhatsApp, llega una llamada a `POST /webhooks/whatsapp`
- recibes una respuesta en WhatsApp

## 11. Errores típicos

### Meta no puede verificar el webhook

Revisa:

- que `ngrok` siga activo
- que el `Callback URL` termine en `/webhooks/whatsapp`
- que `WHATSAPP_VERIFY_TOKEN` coincida exactamente
- que el backend esté corriendo

### Meta no entrega mensajes al backend

Revisa:

- que el campo `messages` esté suscrito
- que configuraste el webhook en la app correcta
- que estás enviando mensajes al número correcto

### El backend recibe pero no responde

Revisa:

- que `WHATSAPP_ACCESS_TOKEN_EASYCOMP` siga vigente
- que `EASYCOMP_PHONE_NUMBER_ID` sea correcto
- que el token y el número pertenezcan a la misma app/WABA

## 12. Recomendación práctica para tus primeras pruebas

Para la primera ronda, hazlo así:

1. crea una app nueva
2. usa los recursos de prueba de Meta
3. configura `.env`
4. levanta backend
5. levanta `ngrok`
6. configura webhook
7. prueba un mensaje simple

Eso te valida el flujo sin mezclar todavía números reales de negocio.

Después, cuando todo funcione, ya puedes pasar a:

- número real del negocio
- onboarding real de tenants
- runtime con varios tenants
- handoff humano

## 13. Qué copiar de Meta para este proyecto

Resumen rápido de lo que debes copiar desde la app nueva:

- `Temporary access token` -> `WHATSAPP_ACCESS_TOKEN_EASYCOMP`
- `Phone number ID` -> `EASYCOMP_PHONE_NUMBER_ID`
- número visible o de prueba -> `EASYCOMP_PHONE_NUMBER`

Y además debes inventar tú mismo:

- `WHATSAPP_VERIFY_TOKEN`

## 14. Fuentes oficiales usadas

Usé referencias oficiales de Meta para esta guía:

- [Meta Developers: WhatsApp Cloud API Overview](https://meta-preview.mintlify.io/docs/whatsapp/cloud-api/overview)
- [Meta Postman Workspace: WhatsApp Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api)

### Qué confirmé desde esas fuentes

Confirmado por Meta:

- Cloud API requiere un `business portfolio`
- el flujo inicial crea un `test WABA` y un `test business phone number`
- los webhooks son obligatorios para recibir mensajes y estados
- los permisos importantes incluyen `whatsapp_business_management` y `whatsapp_business_messaging`
- el `phone_number_id` es necesario para enviar mensajes

## 15. Siguiente paso recomendado

Después de crear la app nueva en Meta, sigue esta secuencia:

1. completa tu `.env`
2. levanta `npm run dev`
3. levanta `ngrok http 3000`
4. configura webhook
5. envía el primer mensaje de prueba

Si quieres, después de esto puedo ayudarte a crear una segunda guía todavía más práctica: una checklist de “copia exactamente estos valores de Meta y pégalos aquí en el `.env`”. 
