# SPEC TÉCNICO — Proyecto 1: EasyComp Bot IA

## 1. Objetivo

Construir un backend de IA conversacional para WhatsApp que permita a EasyComp conectar negocios a WhatsApp Cloud API, responder preguntas frecuentes automáticamente, consultar una base de conocimiento/RAG y derivar a humano cuando el bot no tenga suficiente confianza.

Este proyecto NO incluye portal web de administración completo. Solo debe exponer APIs para que un portal futuro pueda administrarlo.

---

# 2. Alcance del proyecto

## Incluye

* Recepción de mensajes desde WhatsApp Cloud API.
* Identificación del negocio por `phone_number_id`.
* Soporte multi-tenant.
* Motor de decisión BOT/HUMAN.
* Respuestas por FAQ.
* Respuestas por RAG.
* Respuestas con IA.
* Derivación humana.
* Notificación a vendedores.
* Registro de conversaciones y mensajes.
* Métricas básicas.
* APIs internas para configuración.

## No incluye

* Portal web visual.
* Inbox omnicanal.
* Instagram.
* Messenger.
* Telegram.
* TikTok.
* Facturación.
* Gestión visual de usuarios.

---

# 3. Arquitectura general

```txt
WhatsApp Cloud API
        │
        ▼
Webhook EasyComp Bot IA
        │
        ▼
Backend Node.js / NestJS
        │
        ├── Tenant Resolver
        ├── Conversation Manager
        ├── Bot Decision Engine
        ├── FAQ Engine
        ├── RAG Engine
        ├── AI Response Engine
        ├── Human Handoff Engine
        └── Metrics Engine
        │
        ▼
PostgreSQL / Supabase + pgvector
```

---

# 4. Stack recomendado

## Backend

```txt
Node.js + NestJS
```

También puede usarse Express, pero NestJS es mejor para escalar por módulos.

## Base de datos

```txt
PostgreSQL / Supabase
```

## Vector DB

```txt
pgvector
```

## IA

```txt
OpenAI GPT-4o-mini
```

## Infraestructura

```txt
Docker
Nginx
VPS o EC2
```

---

# 5. Entidades principales

## 5.1 Businesses

Representa cada negocio cliente de EasyComp.

```sql
businesses
- id
- name
- slug
- status
- bot_global_enabled
- default_ai_model
- confidence_threshold
- timezone
- created_at
- updated_at
```

Ejemplo:

```txt
bot_global_enabled = true
confidence_threshold = 0.70
```

---

## 5.2 WhatsApp Accounts

Relaciona un número de WhatsApp con un negocio.

```sql
whatsapp_accounts
- id
- business_id
- phone_number_id
- waba_id
- display_phone_number
- access_token_encrypted
- verify_token
- status
- coexistence_enabled
- created_at
- updated_at
```

Regla:

```txt
phone_number_id identifica a qué negocio pertenece cada mensaje.
```

---

## 5.3 Customers

Clientes finales que escriben al negocio.

```sql
customers
- id
- business_id
- name
- phone
- first_seen_at
- last_seen_at
- created_at
- updated_at
```

---

## 5.4 Conversations

Conversación entre cliente final y negocio.

```sql
conversations
- id
- business_id
- customer_id
- channel
- external_conversation_id
- mode
- status
- assigned_agent_id
- last_message_at
- bot_resume_at
- handoff_reason
- created_at
- updated_at
```

Valores:

```txt
channel = WHATSAPP
mode = BOT | HUMAN
status = OPEN | CLOSED | PENDING
```

---

## 5.5 Messages

Historial de mensajes.

```sql
messages
- id
- business_id
- conversation_id
- customer_id
- channel
- external_message_id
- direction
- sender_type
- message_type
- content
- raw_payload
- ai_generated
- created_at
```

Valores:

```txt
direction = INBOUND | OUTBOUND
sender_type = CUSTOMER | BOT | HUMAN | SYSTEM
message_type = TEXT | IMAGE | AUDIO | DOCUMENT
```

---

## 5.6 FAQs

Preguntas frecuentes configuradas por negocio.

```sql
faqs
- id
- business_id
- question
- answer
- category
- active
- priority
- created_at
- updated_at
```

---

## 5.7 Knowledge Documents

Documentos cargados para RAG.

```sql
knowledge_documents
- id
- business_id
- title
- source_type
- file_url
- raw_text
- status
- created_at
- updated_at
```

Valores:

```txt
source_type = PDF | DOCX | TXT | MANUAL | URL
status = PENDING | INDEXED | ERROR
```

---

## 5.8 Knowledge Chunks

Fragmentos indexados para búsqueda semántica.

```sql
knowledge_chunks
- id
- business_id
- document_id
- chunk_text
- embedding
- metadata
- created_at
```

---

## 5.9 Business Agents

Vendedores o humanos que recibirán alertas.

```sql
business_agents
- id
- business_id
- name
- phone
- role
- notify_on_handoff
- active
- created_at
- updated_at
```

---

## 5.10 Usage Events

Eventos para métricas y límites.

```sql
usage_events
- id
- business_id
- conversation_id
- event_type
- tokens_input
- tokens_output
- estimated_cost
- metadata
- created_at
```

Ejemplos:

```txt
MESSAGE_RECEIVED
AI_RESPONSE_SENT
FAQ_RESPONSE_SENT
RAG_RESPONSE_SENT
HUMAN_HANDOFF
BOT_DISABLED
BOT_ENABLED
```

---

# 6. Flujo principal de mensaje

## 6.1 Entrada

Meta envía webhook al endpoint:

```http
POST /webhooks/whatsapp
```

---

## 6.2 Procesamiento

```txt
1. Recibir payload de Meta.
2. Validar firma o token.
3. Extraer phone_number_id.
4. Buscar whatsapp_account.
5. Resolver business_id.
6. Buscar o crear customer.
7. Buscar o crear conversation.
8. Guardar mensaje entrante.
9. Verificar bot_global_enabled.
10. Verificar conversation.mode.
11. Si puede responder, ejecutar motor de respuesta.
12. Enviar respuesta o derivar.
13. Guardar métricas.
```

---

# 7. Motor de decisión

## Regla global

```txt
Si business.bot_global_enabled = false
→ No responder automáticamente.
```

## Regla por conversación

```txt
Si conversation.mode = HUMAN
→ No responder automáticamente.
```

## Regla activa

```txt
Si business.bot_global_enabled = true
y conversation.mode = BOT
→ El bot puede responder.
```

---

# 8. Motor de respuesta

El bot debe responder en este orden:

```txt
1. FAQ exacta o alta similitud
2. RAG
3. IA con contexto
4. Derivación humana
```

---

## 8.1 FAQ Engine

Buscar coincidencia en `faqs`.

Criterios:

```txt
- match exacto
- similitud semántica
- prioridad
- active = true
```

Si encuentra respuesta confiable:

```txt
Responder FAQ
Registrar evento FAQ_RESPONSE_SENT
```

---

## 8.2 RAG Engine

Si FAQ no responde:

```txt
1. Crear embedding del mensaje.
2. Buscar chunks por similitud.
3. Filtrar por business_id.
4. Tomar top 3-5 chunks.
5. Calcular score.
```

Si score >= `confidence_threshold`:

```txt
Generar respuesta usando contexto.
```

---

## 8.3 AI Response Engine

Prompt base:

```txt
Eres un asistente del negocio {{business_name}}.
Responde solamente usando la información entregada.
No inventes.
Si no sabes, deriva a humano.
Mantén un tono cercano, claro y profesional.
```

Reglas:

```txt
- No inventar precios.
- No inventar stock.
- No prometer disponibilidad.
- No responder temas fuera del negocio.
- Si hay duda, derivar.
```

---

# 9. Derivación humana

Debe ocurrir cuando:

```txt
- score RAG bajo
- intención de hablar con humano
- reclamo
- garantía
- devolución
- cotización especial
- pregunta sensible
- usuario molesto
- IA no tiene contexto suficiente
```

## Flujo de derivación

```txt
1. Enviar mensaje al cliente:
   "Déjame revisarlo con un asesor y te respondemos en breve."

2. Cambiar:
   conversation.mode = HUMAN

3. Guardar:
   handoff_reason

4. Notificar agentes activos.

5. Registrar evento:
   HUMAN_HANDOFF
```

---

# 10. Notificación a humanos

Enviar alerta por WhatsApp o canal interno configurado.

Mensaje ejemplo:

```txt
⚠️ Atención humana requerida

Negocio: {{business_name}}
Cliente: {{customer_name}}
Número: {{customer_phone}}

Último mensaje:
"{{message_text}}"

Motivo:
{{handoff_reason}}
```

---

# 11. Reactivación del bot

El bot puede volver a modo BOT por:

## 11.1 API

```http
PATCH /conversations/:id/mode
```

Body:

```json
{
  "mode": "BOT"
}
```

## 11.2 Automático

Si `bot_resume_at` está definido y ya pasó la fecha:

```txt
conversation.mode = BOT
```

## 11.3 Comando futuro

Ejemplo:

```txt
#bot
```

---

# 12. APIs internas requeridas

Estas APIs serán usadas por el portal web futuro.

## Businesses

```http
GET /businesses/:id
PATCH /businesses/:id/settings
```

Permite actualizar:

```json
{
  "bot_global_enabled": true,
  "confidence_threshold": 0.7
}
```

---

## Conversations

```http
GET /businesses/:businessId/conversations
GET /conversations/:id
PATCH /conversations/:id/mode
```

---

## FAQs

```http
GET /businesses/:businessId/faqs
POST /businesses/:businessId/faqs
PATCH /faqs/:id
DELETE /faqs/:id
```

---

## Knowledge

```http
POST /businesses/:businessId/knowledge-documents
POST /knowledge-documents/:id/index
GET /businesses/:businessId/knowledge-documents
DELETE /knowledge-documents/:id
```

---

## Metrics

```http
GET /businesses/:businessId/metrics/summary
GET /businesses/:businessId/metrics/questions
GET /businesses/:businessId/metrics/usage
```

---

# 13. Métricas mínimas

El bot debe calcular:

```txt
- total_messages_received
- total_ai_responses
- total_faq_responses
- total_rag_responses
- total_human_handoffs
- estimated_ai_cost
- estimated_hours_saved
- top_questions
```

Fórmula inicial sugerida:

```txt
estimated_hours_saved = ai_responses * 1.5 minutos / 60
```

---

# 14. Seguridad

## Requisitos

```txt
- Validar webhooks de Meta.
- Guardar tokens cifrados.
- Separar datos por business_id.
- No mezclar RAG entre negocios.
- Rate limiting por negocio.
- Logs sin exponer datos sensibles.
```

---

# 15. Variables de entorno

```env
DATABASE_URL=
OPENAI_API_KEY=
META_APP_SECRET=
META_VERIFY_TOKEN=
META_GRAPH_API_VERSION=
ENCRYPTION_SECRET=
REDIS_URL=
NODE_ENV=
```

---

# 16. Requisitos de estabilidad

```txt
- Procesar webhooks rápido.
- Responder 200 OK a Meta lo antes posible.
- Usar cola para procesamiento pesado.
- Reintentar envíos fallidos.
- Registrar errores.
- Evitar que una falla de IA detenga el webhook.
```

Arquitectura sugerida:

```txt
Webhook recibe mensaje
↓
Guarda mensaje
↓
Encola job
↓
Responde 200 OK
↓
Worker procesa IA y responde
```

---

# 17. Criterios de aceptación MVP

El MVP estará listo cuando:

```txt
1. Reciba mensajes desde WhatsApp Cloud API.
2. Identifique correctamente el negocio por phone_number_id.
3. Guarde clientes, conversaciones y mensajes.
4. Respete bot_global_enabled.
5. Respete conversation.mode BOT/HUMAN.
6. Responda FAQs.
7. Responda usando RAG.
8. Derive a humano si no sabe.
9. Notifique al vendedor.
10. Exponga APIs para dashboard futuro.
11. Registre métricas básicas.
```

---

# 18. Roadmap posterior

## Fase 2

```txt
- Soporte imágenes
- Soporte audios
- Resumen de conversación para humano
- Detección avanzada de intención
```

## Fase 3

```txt
- Instagram DM
- Messenger
- Telegram
- Webchat
```

## Fase 4

```txt
- Motor de planes y límites
- Facturación
- Automatizaciones comerciales
```
