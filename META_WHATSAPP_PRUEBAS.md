# Requisitos y Configuración de Meta/WhatsApp para Hacer Pruebas

Esta guía resume qué debes tener configurado en Meta y en WhatsApp para poder probar este proyecto localmente o en un entorno de testing.

Está pensada para dos escenarios:

- `Prueba rápida con recursos de prueba de Meta`
- `Prueba más real con un número propio del negocio`

## 1. Qué necesitas antes de empezar

Necesitas como mínimo:

- una cuenta de `Meta for Developers`
- acceso administrador a un `Meta Business Portfolio`
- una app de Meta de tipo negocio
- el producto `WhatsApp` agregado a esa app
- un `WhatsApp Business Account` o `WABA`
- un `phone_number_id`
- un token de acceso válido para llamar la Cloud API
- una URL pública con `HTTPS` para recibir webhooks
- este backend corriendo y accesible desde internet

## 2. Qué crea Meta automáticamente en pruebas

Según la documentación oficial de Meta, al completar el flujo inicial de `Get Started` se crea automáticamente:

- un `test WABA`
- un `test business phone number`

Eso sirve para probar sin partir con toda la configuración productiva desde el día 1.

Importante:

- Meta indica que los recursos de prueba evitan varios límites normales de mensajería.
- Meta también indica que esos recursos de prueba no requieren método de pago para enviar mensajes de plantilla durante pruebas.

## 3. Diferencia entre prueba rápida y prueba real

### Opción A. Prueba rápida con número de prueba de Meta

Úsala si solo quieres validar:

- que el webhook recibe mensajes
- que tu backend responde
- que puedes enviar mensajes desde la API

Ventajas:

- más rápida de configurar
- no necesitas conectar todavía un número real del negocio

Limitaciones:

- no representa por completo el flujo real de producción
- algunas restricciones y capacidades pueden diferir de un número productivo

### Opción B. Prueba con número real del negocio

Úsala si quieres validar:

- el onboarding real del número
- el comportamiento final del bot con el número que se usará en producción
- handoff humano y operación real del tenant

Ventajas:

- es el escenario más cercano a producción

Limitaciones:

- requiere más pasos de configuración
- puede implicar verificación adicional del negocio y del número

## 4. Configuración mínima en Meta

### 4.1 Crear la app

En `Meta for Developers`:

1. Crea una app de tipo negocio.
2. Agrega el producto `WhatsApp`.
3. Entra a `WhatsApp > Quickstart`.

Desde ahí normalmente podrás ver o generar estos datos:

- `Temporary access token` o token inicial
- `Phone number ID`
- `WhatsApp Business Account ID`
- número de prueba o número conectado

## 4.2 Tener un Business Portfolio

Meta documenta que para usar Cloud API necesitas un `business portfolio`, porque ahí viven:

- el `WABA`
- los números de negocio

Si no existe, Meta normalmente te lo pide durante el flujo inicial.

## 4.3 Obtener el token correcto

Para este proyecto necesitas un token que permita enviar y gestionar mensajes por API.

Meta documenta estos tipos de token:

- `System User Access Tokens`
- `Business Integration System User Access Tokens`
- `User Access Tokens`

Para pruebas rápidas puedes comenzar con un token temporal. Para algo más estable conviene migrar después a un token de sistema.

## 4.4 Permisos relevantes

Meta documenta que los permisos más importantes para este tipo de integración son:

- `business_management`
- `whatsapp_business_management`
- `whatsapp_business_messaging`

Sin esos permisos, la app puede quedar limitada para enviar mensajes, administrar el WABA o consultar recursos.

## 4.5 Conectar o registrar el número

Para usar un número real del negocio debes tener un número que pueda quedar registrado en Cloud API.

Puntos importantes:

- el número debe poder verificarse
- el número debe quedar asociado al `WABA`
- el número debe quedar con su `phone_number_id`
- si el número estaba en otra modalidad de WhatsApp Business Platform, puede requerir migración antes de usar Cloud API

## 4.6 Configurar el webhook

Meta usa webhooks para:

- mensajes entrantes de clientes
- estados de entrega de mensajes salientes

En la app debes configurar:

- `Callback URL`
- `Verify Token`

Y luego suscribirte, como mínimo, al campo:

- `messages`

Para este proyecto:

- `GET /webhooks/whatsapp` valida el webhook
- `POST /webhooks/whatsapp` recibe mensajes y eventos

Por eso tu `Callback URL` debe apuntar a algo como:

```text
https://tu-dominio.com/webhooks/whatsapp
```

Y el `Verify Token` configurado en Meta debe coincidir exactamente con:

```env
WHATSAPP_VERIFY_TOKEN=...
```

## 4.7 Tener una URL pública HTTPS

Meta envía webhooks a una URL pública.

Eso significa que para probar no basta con que el backend corra solo en `localhost`. Necesitas exponerlo con algo como:

- `ngrok`
- un deploy temporal en Render, Railway o VPS
- cualquier túnel o dominio con `HTTPS`

Ejemplo:

```text
https://abc123.ngrok-free.app/webhooks/whatsapp
```

## 5. Configuración mínima en este proyecto

En tu archivo `.env` necesitas completar como mínimo:

```env
DATABASE_URL=postgresql://...
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_GRAPH_VERSION=v20.0
WHATSAPP_ACCESS_TOKEN_EASYCOMP=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
EASYCOMP_PHONE_NUMBER=+569...
EASYCOMP_PHONE_NUMBER_ID=...
```

## 6. Qué valor de Meta va en cada variable

### Para el número EasyComp

Si vas a usar un número para onboarding o pruebas administrativas, debes mapear:

- `EASYCOMP_PHONE_NUMBER`
  - el número visible del negocio o número de prueba EasyComp
- `EASYCOMP_PHONE_NUMBER_ID`
  - el `Phone number ID` de ese número en Meta
- `WHATSAPP_ACCESS_TOKEN_EASYCOMP`
  - el token que autoriza enviar mensajes desde ese número

### Para los tenants del negocio

En este MVP, cada tenant guarda su token en:

- `tenant_config.configJson.whatsappAccessToken`

Y además cada tenant necesita en base de datos:

- el número del negocio
- su `phone_number_id`

Eso se guarda al completar onboarding o por seed.

## 7. Configuración recomendada para pruebas del MVP

Si quieres probar este proyecto de forma práctica, te recomiendo este orden:

1. Configura un número EasyComp para onboarding.
2. Deja operativo el webhook público.
3. Ejecuta la app local.
4. Verifica el webhook en Meta.
5. Prueba primero el flujo de onboarding con el número EasyComp.
6. Luego prueba un tenant con su número productivo o de prueba.

## 8. Checklist de Meta para que las pruebas funcionen

Antes de probar, revisa esto:

- la app de Meta existe
- el producto `WhatsApp` está agregado
- tienes un `WABA`
- tienes un `phone_number_id`
- tienes un token vigente
- el webhook está configurado con la URL correcta
- el `Verify Token` coincide con el `.env`
- el campo `messages` está suscrito
- el backend está accesible por `HTTPS`
- el backend responde `200` en la verificación del webhook

## 9. Prueba mínima recomendada

Haz esta secuencia:

1. Levanta el backend.
2. Expón la URL pública.
3. Configura el webhook en Meta.
4. Verifica que Meta acepte el webhook.
5. Envía un mensaje desde WhatsApp al número configurado.
6. Revisa que llegue al endpoint `POST /webhooks/whatsapp`.
7. Revisa que el backend envíe una respuesta por Cloud API.

## 10. Errores comunes

### El webhook no verifica

Revisa:

- que la URL pública sea correcta
- que el endpoint sea `GET /webhooks/whatsapp`
- que `WHATSAPP_VERIFY_TOKEN` coincida exactamente con el valor en Meta

### Meta no entrega mensajes entrantes

Revisa:

- que el campo `messages` esté suscrito
- que el webhook esté guardado en la app correcta
- que el número usado realmente pertenezca al `WABA` correcto

### El backend no puede responder mensajes

Revisa:

- que el token tenga permisos válidos
- que el `phone_number_id` sea correcto
- que el número emisor corresponda al token y al WABA correcto

### El número real no se puede usar

Revisa:

- si el número ya estaba registrado en otra cuenta o en otra modalidad
- si falta completar su verificación
- si el negocio o el perfil necesitan aprobación adicional

## 11. Recomendación práctica para este proyecto

Para la primera prueba de punta a punta:

- usa `1 número EasyComp` para onboarding
- usa `1 número de prueba o 1 número real` para el tenant
- deja ambos con webhook apuntando al mismo backend

El backend ya decide internamente si el mensaje va a:

- onboarding
- admin engine
- runtime del bot

## 12. Fuentes oficiales usadas

Usé documentación oficial de Meta para confirmar esta guía:

- [Meta Developers: WhatsApp Cloud API Overview](https://meta-preview.mintlify.io/docs/whatsapp/cloud-api/overview)
- [Meta Postman Workspace: WhatsApp Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api)

### Resumen de lo confirmado en docs

Confirmado por Meta:

- Cloud API requiere `business portfolio`
- el flujo inicial crea `test WABA` y `test business phone number`
- Cloud API usa webhooks para mensajes entrantes y estados
- los permisos clave incluyen `whatsapp_business_management` y `whatsapp_business_messaging`
- el `phone_number_id` es un recurso central para enviar mensajes

### Nota

Algunos detalles de interfaz del panel de Meta pueden cambiar con el tiempo aunque los conceptos base se mantengan. Si ves que un menú cambió de nombre, normalmente la lógica sigue siendo la misma: `app` -> `WhatsApp` -> `Quickstart/Configuration` -> `webhook`, `token`, `phone number id`.
