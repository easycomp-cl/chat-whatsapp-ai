# Especificación para Codex — SaaS de chatbot IA por WhatsApp para múltiples negocios

## Objetivo general
Construir un MVP en 2 semanas de una plataforma SaaS multi-tenant donde cada negocio cliente use su propio número de WhatsApp Business para atender clientes finales con IA, mientras EasyComp usa un número separado para onboarding/configuración inicial del tenant.

El sistema debe permitir:
- Onboarding conversacional por WhatsApp desde el número de EasyComp.
- Operación automática del bot de IA en el número WhatsApp Business del negocio cliente.
- Soporte multi-tenant.
- RAG para responder solo con información real del negocio.
- Handoff a humano sin perder trazabilidad.
- Acciones de negocio: responder información, registrar leads, agendar, cotizar, derivar a humano, guardar historial.
- Administración básica vía WhatsApp por comandos del admin del negocio, sin panel web en esta primera fase.

---

# Visión de arquitectura

## Números involucrados
1. **Número EasyComp**
   - Uso exclusivo para onboarding, configuración, soporte y comandos globales.
   - El administrador del negocio conversa con este número para configurar su tenant.

2. **Número del negocio cliente**
   - Es el número productivo del tenant.
   - Atiende clientes finales con IA.
   - Permite intervención humana del admin.
   - También puede aceptar algunos comandos admin controlados.

## Regla clave
- Todo mensaje de cualquier número debe pasar por el backend.
- El backend decide si el mensaje entra al motor de onboarding, al motor runtime del bot, o al motor de comandos admin.
- Nunca depender de la app manual de WhatsApp como fuente principal de operación.

---

# Stack sugerido para MVP

## Backend
- Node.js + TypeScript
- Framework sugerido: NestJS o Express con arquitectura modular
- Validación: Zod
- ORM: Prisma
- Base de datos: PostgreSQL (ideal Supabase)
- Cola opcional liviana: tabla de jobs en PostgreSQL

## IA
- OpenAI Responses API
- Tool calling / function calling
- RAG con vector store o almacenamiento documental indexado

## Canal
- WhatsApp Cloud API
- Webhook para mensajes entrantes y estados

## Infraestructura
- Deploy en Render / Railway / VPS / Vercel serverless según preferencia
- Para webhook conviene backend persistente, no solo funciones dispersas

---

# Fases del sistema

## 1. Onboarding engine
Responsable de instalar/configurar al negocio cliente mediante conversación por WhatsApp usando el número EasyComp.

## 2. Runtime engine
Responsable de atender clientes finales en el número del negocio usando IA + RAG + funciones.

## 3. Admin command engine
Responsable de procesar comandos del admin del negocio, ya sea por el número EasyComp o por el mismo número del negocio bajo contexto controlado.

---

# Requerimientos funcionales

## A. Multi-tenant
El sistema debe soportar múltiples negocios con aislamiento lógico de datos.

Cada tenant debe tener:
- nombre del negocio
- rubro / vertical
- número productivo de WhatsApp
- lista de admins autorizados
- documentos de conocimiento
- FAQs
- catálogo de productos o servicios
- configuración de tono
- acciones habilitadas
- mensajes por defecto
- reglas de handoff a humano

## B. Onboarding por WhatsApp
El onboarding debe ser una conversación guiada por pasos y guardar estado.

### Datos a recopilar como mínimo
1. Datos del admin principal
   - nombre
   - teléfono
   - cargo opcional

2. Datos del negocio
   - nombre empresa
   - dirección
   - ciudad/comuna
   - horario de atención
   - rubro
   - si vende productos, servicios o ambos

3. Catálogo inicial
   - si servicios: nombre, descripción, duración, precio
   - si productos: nombre, descripción, precio, código opcional, foto opcional

4. FAQ base
   - horario
   - ubicación
   - medios de pago
   - cobertura
   - cómo hablar con humano
   - tiempos estimados
   - políticas básicas
   - preguntas adicionales personalizadas

5. Acciones habilitadas del bot
   - responder información
   - registrar leads
   - agendar
   - cotizar
   - sugerir productos/servicios
   - derivar a humano

6. Mensajes por defecto
   - saludo inicial
   - mensaje cuando no sabe algo
   - mensaje de derivación a humano
   - mensaje fuera de horario

7. Personalización opcional
   - nombre del bot
   - tono del bot
   - objetivos principales del bot

### Características del onboarding
- Debe poder pausar y reanudar.
- Debe permitir omitir pasos opcionales.
- Debe permitir reingresar a bloques como “agregar producto”, “cambiar horario”, “agregar FAQ”.
- Debe validar respuestas antes de persistir.
- Debe terminar generando una configuración lista para uso productivo.

## C. Operación del bot en el número del negocio
El bot debe:
- recibir mensajes de clientes finales
- identificar tenant por número receptor
- identificar rol del remitente (admin o cliente)
- usar RAG para responder solo información real
- ejecutar funciones si corresponde
- guardar contexto y memoria del cliente
- transferir a humano cuando aplique

## D. Handoff a humano
Debe existir un mecanismo de traspaso a humano sin perder tracking.

### Reglas
- La conversación siempre sigue entrando por el mismo número del negocio.
- El estado de conversación puede ser:
  - `bot`
  - `human`
  - `closed`
- Cuando queda en `human`, la IA no responde automáticamente.
- Los mensajes siguen entrando al backend y se guardan.
- El admin puede responder y el backend debe enrutar correctamente al cliente.

## E. Admin vía WhatsApp
En MVP el admin no tendrá panel web.
Debe poder ejecutar acciones por WhatsApp.

### Canales admin permitidos
1. Número EasyComp
   - onboarding
   - soporte
   - configuración

2. Número del negocio
   - comandos controlados
   - respuesta humana a clientes

### Comandos iniciales sugeridos
- `CONFIG`
- `VER RESUMEN`
- `AGREGAR PRODUCTO`
- `AGREGAR SERVICIO`
- `AGREGAR FAQ`
- `CAMBIAR HORARIO`
- `MODO HUMANO`
- `MODO BOT`
- `DERIVAR`
- `REANUDAR BOT`

---

# Diseño lógico por capas

## 1. Channel layer
Responsable de:
- recibir webhook de WhatsApp
- normalizar payload
- enviar mensajes salientes

## 2. Router layer
Decide a qué motor enviar el mensaje:
- onboarding engine
- runtime engine
- admin engine

### Router pseudo-lógica
```ts
if (receiverPhone === EASYCOMP_PHONE) {
  routeToOnboardingOrSupport();
} else {
  if (senderPhone is tenant admin) {
    routeToAdminOrHumanReply();
  } else {
    routeToRuntimeBot();
  }
}
```

## 3. Onboarding engine
Responsable de:
- leer estado de onboarding
- enviar siguiente pregunta
- validar respuesta
- persistir datos
- construir config final

## 4. Runtime engine
Responsable de:
- recuperar contexto del cliente
- clasificar intención
- consultar RAG
- llamar funciones
- responder
- guardar trazabilidad

## 5. Admin engine
Responsable de:
- detectar comandos admin
- ejecutar acciones de configuración
- responder en contexto de conversación humana

## 6. Action layer
Conjunto de funciones del negocio accesibles por el modelo:
- crear lead
- actualizar cliente
- crear agenda
- listar horarios
- crear cotización
- derivar a humano
- registrar venta

## 7. Knowledge layer
Responsable de:
- indexar documentos del tenant
- consultar fragmentos relevantes
- exponer contexto confiable al modelo

---

# Modelo de datos sugerido

## tenants
- id
- name
- business_type
- status
- timezone
- created_at
- updated_at

## tenant_channels
- id
- tenant_id
- channel_type (`easycomp_onboarding`, `whatsapp_business`)
- phone_number
- phone_number_id
- waba_id
- is_active

## tenant_admins
- id
- tenant_id
- name
- phone_number
- role
- is_primary
- is_active

## onboarding_sessions
- id
- tenant_id
- admin_phone
- current_step
- status (`in_progress`, `paused`, `completed`)
- collected_data_json
- started_at
- updated_at

## onboarding_answers
- id
- onboarding_session_id
- step_key
- answer_json
- created_at

## tenant_configs
- id
- tenant_id
- bot_name
- bot_tone
- fallback_message
- handoff_message
- out_of_hours_message
- enable_rag
- enable_lead_capture
- enable_booking
- enable_quotes
- enable_suggestions
- config_json

## tenant_services
- id
- tenant_id
- name
- description
- duration_minutes
- price
- currency
- is_active

## tenant_products
- id
- tenant_id
- sku
- name
- description
- price
- currency
- image_url
- stock_optional
- is_active

## tenant_faqs
- id
- tenant_id
- question
- answer
- source (`manual`, `generated_onboarding`, `document`)
- is_active

## tenant_documents
- id
- tenant_id
- title
- file_url
- file_type
- status
- indexed_at

## customers
- id
- tenant_id
- phone_number
- name
- address
- notes
- tags_json
- first_seen_at
- last_seen_at

## conversations
- id
- tenant_id
- customer_id
- channel_phone_number
- status (`open`, `closed`, `pending`)
- mode (`bot`, `human`)
- assigned_admin_id nullable
- current_intent nullable
- last_message_at
- created_at

## messages
- id
- conversation_id
- tenant_id
- sender_type (`customer`, `bot`, `admin`, `system`)
- sender_phone
- receiver_phone
- content_text
- content_type (`text`, `image`, `audio`, `document`, `interactive`)
- raw_payload_json
- created_at

## leads
- id
- tenant_id
- customer_id
- source (`whatsapp`)
- status (`new`, `qualified`, `won`, `lost`)
- notes
- created_at
- updated_at

## appointments
- id
- tenant_id
- customer_id
- service_id nullable
- scheduled_start
- scheduled_end
- status (`pending`, `confirmed`, `cancelled`, `completed`)
- notes

## quotes
- id
- tenant_id
- customer_id
- status (`draft`, `sent`, `accepted`, `rejected`)
- total_amount
- payload_json
- created_at

## sales
- id
- tenant_id
- customer_id
- source_conversation_id nullable
- total_amount
- status
- payload_json
- created_at

## admin_conversation_links
Sirve para enrutar respuestas humanas del admin a un cliente concreto mientras no exista panel.
- id
- tenant_id
- admin_id
- conversation_id
- status (`active`, `closed`)
- created_at
- updated_at

## audit_logs
- id
- tenant_id
- actor_type (`system`, `admin`, `bot`)
- actor_ref
- event_type
- payload_json
- created_at

---

# Estados y reglas

## Roles
- `platform_admin`
- `tenant_admin`
- `customer`

## Estado onboarding
- `not_started`
- `in_progress`
- `paused`
- `completed`

## Estado conversación
- `open`
- `pending`
- `closed`

## Modo conversación
- `bot`
- `human`

## Regla de resolución de mensajes
1. Identificar canal receptor.
2. Identificar tenant.
3. Identificar si remitente es admin.
4. Resolver si entra a onboarding, admin engine o runtime.
5. Persistir siempre el mensaje antes de responder.

---

# Flujos principales

## Flujo 1 — Onboarding inicial
1. Admin escribe al número EasyComp.
2. Se crea o retoma onboarding_session.
3. El sistema hace preguntas por bloques.
4. Valida y guarda cada respuesta.
5. Al finalizar, genera tenant_config, catálogo inicial, FAQ inicial y activa el tenant.
6. Se envía mensaje de confirmación y próximos pasos.

## Flujo 2 — Cliente final pregunta algo
1. Cliente escribe al número del negocio.
2. Se identifica tenant por número receptor.
3. Se crea o actualiza customer.
4. Se crea o actualiza conversation.
5. Se clasifica intención.
6. Se decide entre respuesta RAG o llamada a herramienta.
7. Se genera respuesta.
8. Se guarda todo en BD.

## Flujo 3 — Cliente pide hablar con humano
1. Cliente expresa deseo de hablar con humano o el bot no encuentra respuesta segura.
2. El sistema cambia `mode = human` en la conversación.
3. Se notifica al admin si aplica.
4. El backend ya no responde automáticamente.
5. El admin puede escribir y quedar vinculado a esa conversación mediante `admin_conversation_links`.

## Flujo 4 — Admin responde a cliente sin panel
1. Admin escribe desde su número admin.
2. El sistema detecta que tiene una conversación activa asignada.
3. Reenvía el mensaje al cliente correcto usando la API.
4. Guarda el mensaje como `sender_type = admin`.
5. Opcionalmente el admin puede cerrar o devolver al bot.

## Flujo 5 — Admin reconfigura algo
1. Admin escribe al número EasyComp o usa un comando en el número del negocio.
2. El sistema entra a un subflujo de configuración.
3. Actualiza los datos del tenant.
4. Reindexa si fue necesario el conocimiento.

---

# RAG y políticas de respuesta

## Objetivo
El bot debe responder solo usando información confirmada del negocio.

## Fuentes válidas
- FAQs del tenant
- catálogo del tenant
- documentos cargados
- configuración del tenant
- historial estructurado permitido

## Política estricta
Si la respuesta no está suficientemente soportada por fuentes válidas:
- no inventar
- usar fallback configurable
- ofrecer derivación a humano

## Prompt base del runtime
El modelo debe:
- actuar como asistente del negocio específico
- usar solo información del tenant actual
- jamás mezclar tenants
- no inventar precios ni políticas
- si no tiene certeza, usar fallback
- priorizar capturar lead o cerrar acción según la configuración habilitada

---

# Verticalización sin romper arquitectura

La arquitectura debe ser común.
La personalización por rubro debe resolverse por configuración y playbooks.

## Tabla/objeto sugerido: tenant_playbook
Campos sugeridos:
- tenant_id
- vertical (`generic`, `beauty_salon`, `car_wash`, `bakery`, etc.)
- enabled_intents
- required_customer_fields
- booking_rules_json
- quote_rules_json
- restrictions_json

## Ejemplos
### Panadería
- intención frecuente: consultar stock, encargar, despacho
- agenda opcional
- productos primero

### Peluquería
- intención frecuente: agendar servicio
- servicios con duración
- horarios por profesional

### Lavado de autos
- intención frecuente: agendar bloque
- puede requerir dirección o tipo de vehículo

## Principio
Compartir:
- canal
- router
- runtime
- RAG
- handoff
- persistencia

Cambiar solo:
- playbook
- catálogo
- FAQs
- reglas de acción

---

# Endpoints sugeridos

## Webhook
- `GET /webhooks/whatsapp` verificación
- `POST /webhooks/whatsapp` recepción de eventos

## Runtime interno
- `POST /internal/messages/ingest`
- `POST /internal/runtime/respond`
- `POST /internal/admin/respond`
- `POST /internal/onboarding/advance`

## Gestión interna futura
- `POST /internal/tenants/:id/reindex`
- `POST /internal/tenants/:id/commands`

---

# Servicios y módulos sugeridos

## Módulos
- `channel-whatsapp`
- `router`
- `onboarding`
- `runtime`
- `admin`
- `rag`
- `actions`
- `tenants`
- `customers`
- `conversations`
- `messages`
- `catalog`
- `faqs`
- `audit`

## Servicios clave
- `TenantResolverService`
- `AdminResolverService`
- `OnboardingStateService`
- `ConversationService`
- `MessageIngestService`
- `RuntimeDecisionService`
- `RagService`
- `HumanHandoffService`
- `AdminRoutingService`
- `WhatsAppSendService`

---

# Reglas de negocio para MVP

1. Siempre persistir el mensaje entrante antes de cualquier decisión.
2. Nunca responder mezclando información de otro tenant.
3. Si un admin escribe al número del negocio, nunca tratarlo como cliente normal.
4. El bot debe poder quedar en modo humano por conversación, no por tenant completo.
5. El onboarding debe ser retomable.
6. El admin debe poder agregar FAQs o catálogo sin panel.
7. Todo evento relevante debe generar audit log.

---

# Prioridades de implementación en 2 semanas

## Semana 1
- Multi-tenant base
- Webhook WhatsApp
- Resolución tenant por número
- BD y tablas principales
- Onboarding engine básico por pasos
- Tenant config inicial
- Runtime simple con RAG básico
- Persistencia de conversaciones y mensajes

## Semana 2
- Handoff humano
- Admin command engine
- Enrutamiento admin → cliente sin panel
- Catálogo y FAQ editables por WhatsApp
- Fallbacks y mensajes por defecto
- Logs y manejo de errores
- Pruebas de flujo completo

---

# MVP Definition of Done

El MVP estará listo cuando permita:
1. Dar de alta un tenant desde el número EasyComp.
2. Guardar datos de negocio, FAQs y catálogo mínimo.
3. Atender clientes reales en el número del negocio.
4. Responder con RAG usando información real.
5. Derivar a humano y conservar trazabilidad.
6. Permitir al admin contestar por WhatsApp sin panel.
7. Guardar leads, conversaciones y mensajes en BD.
8. Soportar al menos 3 tenants sin mezcla de datos.

---

# Consideraciones no funcionales

- Código limpio y modular.
- Variables de entorno bien documentadas.
- Logs estructurados.
- Errores controlados y respuestas seguras.
- Preparado para crecer a panel web en fase 2.
- Preparado para futura separación en microservicios si escala.

---

# Lo que NO se debe hacer en este MVP

- No construir panel admin completo.
- No construir microservicios separados todavía.
- No sobreautomatizar onboarding con demasiada libertad.
- No depender de uso manual fuera del backend para handoff.
- No intentar cubrir todos los rubros con lógica específica dura.

---

# Pedido concreto a Codex

Quiero que implementes este proyecto como un backend TypeScript modular, listo para producción básica, con PostgreSQL y WhatsApp Cloud API, siguiendo esta arquitectura.

## Debe incluir
- estructura de carpetas
- modelos de datos
- migraciones
- servicios principales
- webhook de WhatsApp
- onboarding engine con máquina de estados sencilla
- runtime engine con integración a OpenAI
- RAG básico por tenant
- handoff a humano
- admin command engine
- ejemplos de prompts del sistema
- validaciones
- seeds mínimos de ejemplo para 3 tenants
- README de instalación y variables de entorno

## Estilo de implementación
- código claro y mantenible
- separar dominio por módulos
- usar TypeScript estricto
- incluir comentarios útiles solo donde agreguen valor
- evitar complejidad innecesaria
- diseñar pensando en MVP escalable

## Entrega esperada
1. proyecto backend completo
2. archivo `.env.example`
3. README con pasos para correr local
4. endpoints documentados
5. estrategia de pruebas mínima
6. ejemplos de flujos onboarding/runtime/handoff

