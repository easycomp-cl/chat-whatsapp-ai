# ConversAI — Backend Spec: Análisis de Tono y Preguntas Frecuentes desde Chats

## 1. Objetivo del módulo

Agregar al backend existente de ConversAI un módulo que permita:

- Subir chats exportados desde WhatsApp.
- Leer y parsear conversaciones históricas.
- Detectar cómo responde el negocio a sus clientes.
- Analizar el tono, estilo y forma de comunicación del usuario/negocio.
- Detectar preguntas frecuentes repetidas.
- Generar sugerencias de preguntas y respuestas para que el negocio las apruebe.
- Alimentar el perfil de tono del bot y la base de FAQ existente.

Este módulo **no reemplaza** el bot actual. Solo agrega una capa de análisis para mejorar la personalización de las respuestas automáticas.

---

## 2. Alcance

Este spec cubre únicamente:

```txt
- Carga de archivos exportados desde WhatsApp.
- Procesamiento de archivos .txt o .zip.
- Parsing de mensajes.
- Anonimización básica.
- Análisis de tono.
- Detección de preguntas frecuentes.
- Generación de respuestas sugeridas.
- Aprobación, edición o rechazo de sugerencias.
- Actualización del perfil de tono del bot.
```

No incluye:

```txt
- Webhook de WhatsApp.
- Envío de mensajes.
- Gestión de tenants.
- Login.
- Dashboard completo.
- Motor principal del bot.
- Billing.
- Integración con Meta.
```

Se asume que ya existen:

```txt
- tenants
- users
- conversations
- messages
- faq_items o tabla equivalente
- bot_profiles o configuración equivalente del bot
```

---

## 3. Flujo general

```txt
Cliente sube chat exportado desde WhatsApp
        ↓
Backend guarda archivo original
        ↓
Se crea un job de importación
        ↓
Worker procesa archivo
        ↓
Se extraen mensajes
        ↓
Se identifica cliente vs negocio
        ↓
Se anonimiza información sensible
        ↓
IA analiza tono y estilo de respuesta
        ↓
IA detecta preguntas frecuentes
        ↓
IA propone respuestas sugeridas
        ↓
Usuario revisa desde dashboard
        ↓
Usuario aprueba, edita o rechaza
        ↓
FAQs aprobadas se agregan a la base del bot
        ↓
Tono aprobado actualiza perfil del bot
```

---

## 4. Formato esperado de chats exportados

WhatsApp normalmente exporta chats en formato `.txt`.

Ejemplo:

```txt
12/05/2026, 10:42 - Cliente: Hola, cuánto sale?
12/05/2026, 10:43 - Negocio: Hola 😊 El valor es de $15.000
12/05/2026, 10:44 - Cliente: Aceptan transferencia?
12/05/2026, 10:45 - Negocio: Sí, aceptamos transferencia y efectivo.
```

También puede venir como `.zip` que contiene el `.txt`.

El backend debe aceptar:

```txt
.txt
.zip
```

Para esta primera versión se recomienda procesar solo texto y omitir multimedia.

---

## 5. Entidades principales

### 5.1 `chat_import_jobs`

Registra cada importación de chat.

```sql
create table chat_import_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  uploaded_by uuid,
  original_filename text not null,
  file_url text not null,
  status text not null default 'pending',
  total_messages int default 0,
  customer_messages_count int default 0,
  business_messages_count int default 0,
  detected_faq_count int default 0,
  detected_tone_summary text,
  error_message text,
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz
);
```

Estados posibles:

```txt
pending
processing
completed
failed
```

---

### 5.2 `imported_chat_messages`

Guarda los mensajes extraídos desde el archivo exportado.

```sql
create table imported_chat_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  import_job_id uuid not null references chat_import_jobs(id) on delete cascade,
  message_at timestamptz,
  sender_label text,
  sender_role text not null default 'unknown',
  content text,
  content_anonymized text,
  is_question boolean default false,
  is_business_response boolean default false,
  detected_intent text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);
```

Valores para `sender_role`:

```txt
customer
business
unknown
```

Ejemplo:

```json
{
  "sender_label": "Juan",
  "sender_role": "customer",
  "content": "Hola, cuánto sale?",
  "is_question": true
}
```

```json
{
  "sender_label": "Mi Negocio",
  "sender_role": "business",
  "content": "Hola 😊 El valor es de $15.000",
  "is_business_response": true
}
```

---

### 5.3 `detected_faq_suggestions`

Guarda preguntas frecuentes detectadas automáticamente.

```sql
create table detected_faq_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  import_job_id uuid references chat_import_jobs(id) on delete cascade,
  question text not null,
  normalized_question text,
  suggested_answer text,
  category text,
  evidence_count int default 1,
  confidence numeric(5,4),
  status text default 'pending_review',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Estados posibles:

```txt
pending_review
approved
edited
rejected
archived
```

Cuando una sugerencia se aprueba, debe copiarse o transformarse hacia la tabla real de FAQs del sistema, por ejemplo:

```txt
faq_items
knowledge_base
bot_answers
```

según la estructura ya existente.

---

### 5.4 `tone_analysis_results`

Guarda el análisis de tono detectado desde los chats.

```sql
create table tone_analysis_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  import_job_id uuid references chat_import_jobs(id) on delete cascade,
  tone_summary text not null,
  communication_style text,
  common_phrases jsonb default '[]',
  emoji_usage text,
  response_length text,
  sales_style text,
  formality_level text,
  recommended_bot_rules jsonb default '{}',
  confidence numeric(5,4),
  status text default 'pending_review',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);
```

Ejemplo de resultado:

```json
{
  "tone_summary": "El negocio responde de forma cercana, breve y amable. Usa emojis moderados y suele cerrar ofreciendo agendar.",
  "communication_style": "cercano, chileno, directo",
  "common_phrases": [
    "Hola 😊",
    "Puedes agendar por este medio",
    "Quedo atento"
  ],
  "emoji_usage": "moderate",
  "response_length": "short",
  "sales_style": "directo y orientado a agendar",
  "formality_level": "semi_formal",
  "recommended_bot_rules": {
    "max_response_length": "short",
    "use_emojis": true,
    "offer_next_step": true,
    "avoid_long_explanations": true
  }
}
```

---

## 6. Endpoints requeridos

### 6.1 Subir chat exportado

```txt
POST /tenants/:tenantId/chat-imports
```

Content-Type:

```txt
multipart/form-data
```

Body:

```txt
file: archivo .txt o .zip
business_sender_name?: nombre usado por el negocio en el chat
```

Respuesta:

```json
{
  "import_job_id": "uuid",
  "status": "pending",
  "message": "Archivo recibido correctamente"
}
```

---

### 6.2 Obtener estado de importación

```txt
GET /tenants/:tenantId/chat-imports/:importJobId
```

Respuesta:

```json
{
  "id": "uuid",
  "status": "completed",
  "total_messages": 240,
  "customer_messages_count": 132,
  "business_messages_count": 108,
  "detected_faq_count": 12,
  "detected_tone_summary": "El negocio responde de forma cercana, breve y amable."
}
```

---

### 6.3 Listar mensajes importados

```txt
GET /tenants/:tenantId/chat-imports/:importJobId/messages
```

Query params opcionales:

```txt
sender_role=customer
sender_role=business
is_question=true
limit=50
page=1
```

---

### 6.4 Obtener sugerencias de FAQ

```txt
GET /tenants/:tenantId/chat-imports/:importJobId/faq-suggestions
```

Respuesta:

```json
[
  {
    "id": "uuid",
    "question": "¿Cuánto sale la consulta?",
    "suggested_answer": "Hola 😊 El valor de la consulta es de $____. Puedes agendar por este mismo medio.",
    "category": "precios",
    "evidence_count": 9,
    "confidence": 0.91,
    "status": "pending_review"
  }
]
```

---

### 6.5 Aprobar sugerencia de FAQ

```txt
PATCH /tenants/:tenantId/faq-suggestions/:suggestionId/approve
```

Body opcional:

```json
{
  "final_question": "¿Cuánto sale la consulta?",
  "final_answer": "Hola 😊 El valor de la consulta es de $15.000. Puedes agendar por este mismo medio."
}
```

Acción esperada:

```txt
1. Cambiar status de la sugerencia a approved.
2. Crear registro en la tabla real de FAQs del sistema.
3. Asociar la FAQ al tenant.
```

---

### 6.6 Editar sugerencia de FAQ

```txt
PATCH /tenants/:tenantId/faq-suggestions/:suggestionId
```

Body:

```json
{
  "question": "¿Cuál es el valor de la consulta?",
  "suggested_answer": "Hola 😊 La consulta tiene un valor de $15.000.",
  "category": "precios"
}
```

---

### 6.7 Rechazar sugerencia de FAQ

```txt
PATCH /tenants/:tenantId/faq-suggestions/:suggestionId/reject
```

Respuesta:

```json
{
  "status": "rejected"
}
```

---

### 6.8 Obtener análisis de tono

```txt
GET /tenants/:tenantId/chat-imports/:importJobId/tone-analysis
```

Respuesta:

```json
{
  "tone_summary": "El negocio responde de forma cercana, breve y amable.",
  "communication_style": "cercano, chileno, directo",
  "common_phrases": [
    "Hola 😊",
    "Quedo atento",
    "Puedes agendar por este medio"
  ],
  "emoji_usage": "moderate",
  "response_length": "short",
  "sales_style": "orientado a agendar",
  "formality_level": "semi_formal",
  "confidence": 0.88,
  "status": "pending_review"
}
```

---

### 6.9 Aprobar tono detectado

```txt
PATCH /tenants/:tenantId/tone-analysis/:toneAnalysisId/approve
```

Acción esperada:

```txt
1. Cambiar status del análisis de tono a approved.
2. Actualizar el perfil de tono del bot existente.
3. Guardar reglas sugeridas en la configuración del bot.
```

Body opcional:

```json
{
  "tone_summary": "Cercano, breve, amable y directo. Usa emojis moderados.",
  "rules": {
    "use_emojis": "moderate",
    "response_length": "short",
    "style": "semi_formal",
    "offer_next_step": true
  }
}
```

---

## 7. Worker de procesamiento

Crear un worker dedicado:

```txt
chat-import-analysis-worker
```

Responsabilidades:

```txt
1. Leer jobs en estado pending.
2. Cambiar estado a processing.
3. Descargar archivo desde storage.
4. Si es .zip, extraer .txt.
5. Parsear mensajes.
6. Guardar mensajes en imported_chat_messages.
7. Anonimizar contenido.
8. Detectar preguntas.
9. Detectar respuestas del negocio.
10. Enviar muestra de conversación a IA.
11. Guardar análisis de tono.
12. Guardar sugerencias de FAQ.
13. Cambiar job a completed.
14. Si ocurre error, cambiar job a failed.
```

---

## 8. Parser de mensajes

El parser debe soportar mensajes con este patrón base:

```txt
DD/MM/YYYY, HH:mm - Autor: Mensaje
```

Ejemplo:

```txt
12/05/2026, 10:42 - Cliente: Hola, cuánto sale?
```

Debe extraer:

```json
{
  "date": "12/05/2026",
  "time": "10:42",
  "sender": "Cliente",
  "message": "Hola, cuánto sale?"
}
```

Debe considerar:

```txt
- Mensajes multilínea.
- Mensajes del sistema.
- Mensajes eliminados.
- Archivos adjuntos omitidos.
- Formatos con AM/PM.
- Diferencias entre Android e iPhone.
```

Mensajes del sistema a ignorar:

```txt
- Los mensajes y llamadas están cifrados...
- Se eliminó este mensaje
- Omitido
- Archivo adjunto
- Cambió el código de seguridad
```

---

## 9. Detección de cliente vs negocio

El backend necesita identificar quién es el negocio y quién es el cliente.

Opciones:

### Opción A — Manual

Al subir el archivo, el usuario indica el nombre que aparece como negocio.

```json
{
  "business_sender_name": "Spa Aurora"
}
```

Entonces:

```txt
Si sender_label == business_sender_name
sender_role = business
```

---

### Opción B — Automática

Si no se entrega `business_sender_name`, el sistema puede inferir:

```txt
- El remitente que responde más preguntas probablemente es el negocio.
- El remitente que envía precios, horarios, disponibilidad o cierre comercial probablemente es el negocio.
- El remitente con respuestas más repetidas probablemente es el negocio.
```

Para MVP, se recomienda usar primero **Opción A**.

---

## 10. Anonimización

Antes de enviar texto a IA, se debe anonimizar contenido sensible.

Detectar y reemplazar:

```txt
Teléfonos       → [TELEFONO]
Correos         → [EMAIL]
RUT             → [RUT]
Direcciones     → [DIRECCION]
Nombres largos  → [NOMBRE]
Links privados  → [LINK]
Datos bancarios → [DATO_BANCARIO]
```

Ejemplo:

```txt
Original:
Hola soy Juan Pérez, mi RUT es 12.345.678-9 y vivo en Talca.

Anonimizado:
Hola soy [NOMBRE], mi RUT es [RUT] y vivo en [DIRECCION].
```

---

## 11. Prompt para análisis de tono

```txt
Analiza los siguientes mensajes de un negocio con sus clientes.

Objetivo:
Detectar el tono, estilo y forma de responder del negocio.

Debes responder en JSON válido con esta estructura:

{
  "tone_summary": "",
  "communication_style": "",
  "common_phrases": [],
  "emoji_usage": "none | low | moderate | high",
  "response_length": "short | medium | long",
  "sales_style": "",
  "formality_level": "informal | semi_formal | formal",
  "recommended_bot_rules": {
    "use_emojis": "",
    "response_length": "",
    "offer_next_step": true,
    "avoid_long_explanations": true
  },
  "confidence": 0.0
}

Reglas:
- Analiza solo los mensajes marcados como business.
- No inventes información.
- Detecta frases repetidas.
- Detecta si el negocio vende, agenda, informa o deriva.
- Mantén el resultado claro y usable para configurar un bot.
```

---

## 12. Prompt para detección de preguntas frecuentes

```txt
Analiza los siguientes mensajes de clientes y respuestas del negocio.

Objetivo:
Detectar preguntas frecuentes que se repiten y proponer respuestas basadas en cómo responde el negocio.

Debes responder en JSON válido con esta estructura:

{
  "detected_faqs": [
    {
      "question": "",
      "normalized_question": "",
      "suggested_answer": "",
      "category": "",
      "evidence_count": 0,
      "confidence": 0.0
    }
  ]
}

Reglas:
- Agrupa preguntas parecidas.
- No inventes precios, horarios ni datos que no aparezcan en la conversación.
- Si falta un dato importante, usa un placeholder como $____ o ____.
- La respuesta sugerida debe imitar el tono del negocio.
- Solo incluye preguntas que aparezcan más de una vez o que sean claramente relevantes.
- No incluyas información sensible.
```

---

## 13. Ejemplo de resultado esperado

```json
{
  "tone_analysis": {
    "tone_summary": "El negocio responde de forma cercana, breve y amable. Usa emojis moderados y normalmente ofrece agendar o continuar la conversación.",
    "communication_style": "cercano, chileno, directo",
    "common_phrases": [
      "Hola 😊",
      "Sí, claro",
      "Quedo atento",
      "Puedes agendar por este medio"
    ],
    "emoji_usage": "moderate",
    "response_length": "short",
    "sales_style": "orientado a cerrar agenda",
    "formality_level": "semi_formal",
    "confidence": 0.89
  },
  "detected_faqs": [
    {
      "question": "¿Cuánto sale la consulta?",
      "normalized_question": "precio consulta",
      "suggested_answer": "Hola 😊 El valor de la consulta es de $____. Puedes agendar por este mismo medio.",
      "category": "precios",
      "evidence_count": 12,
      "confidence": 0.91
    },
    {
      "question": "¿Dónde están ubicados?",
      "normalized_question": "ubicacion negocio",
      "suggested_answer": "Estamos ubicados en _____. Si quieres, te puedo enviar la dirección.",
      "category": "ubicacion",
      "evidence_count": 8,
      "confidence": 0.86
    }
  ]
}
```

---

## 14. Reglas de aprobación

Las sugerencias detectadas por IA **no deben alimentar automáticamente el bot**.

Flujo correcto:

```txt
1. IA detecta FAQ.
2. Backend guarda sugerencia como pending_review.
3. Usuario revisa en dashboard.
4. Usuario puede:
   - aprobar
   - editar
   - rechazar
5. Solo las aprobadas pasan a la base real de FAQs.
```

Lo mismo aplica para el tono:

```txt
1. IA detecta tono.
2. Usuario revisa.
3. Usuario aprueba o edita.
4. Backend actualiza bot_profile.
```

---

## 15. Validaciones

Al subir archivo:

```txt
- Permitir solo .txt y .zip.
- Tamaño máximo recomendado: 10 MB para MVP.
- Rechazar archivos vacíos.
- Validar que el archivo tenga mensajes parseables.
- Rechazar archivos con formato desconocido.
- Asociar siempre el archivo a un tenant_id.
```

Al aprobar FAQ:

```txt
- question no puede estar vacío.
- answer no puede estar vacío.
- tenant_id debe coincidir.
- No duplicar FAQs iguales.
- Normalizar pregunta antes de guardar.
```

---

## 16. Índices recomendados

```sql
create index idx_chat_import_jobs_tenant_status
on chat_import_jobs(tenant_id, status);

create index idx_imported_chat_messages_job
on imported_chat_messages(import_job_id);

create index idx_imported_chat_messages_tenant_role
on imported_chat_messages(tenant_id, sender_role);

create index idx_detected_faq_suggestions_tenant_status
on detected_faq_suggestions(tenant_id, status);

create index idx_tone_analysis_results_tenant_status
on tone_analysis_results(tenant_id, status);
```

---

## 17. Integración con tablas existentes

Este módulo debe integrarse con las tablas ya existentes.

Cuando se aprueba una FAQ:

```txt
detected_faq_suggestions
        ↓
faq_items existente
```

Cuando se aprueba el tono:

```txt
tone_analysis_results
        ↓
bot_profiles existente
```

Cuando se procesa un archivo:

```txt
chat_import_jobs
        ↓
imported_chat_messages
        ↓
tone_analysis_results
        ↓
detected_faq_suggestions
```

---

## 18. MVP recomendado

Para la primera versión implementar solo:

```txt
1. POST para subir archivo .txt.
2. Guardar job de importación.
3. Parser básico de WhatsApp.
4. Guardar mensajes importados.
5. Campo manual business_sender_name.
6. Análisis IA de tono.
7. Detección IA de FAQ.
8. Listado de sugerencias.
9. Aprobar, editar o rechazar FAQ.
10. Aprobar tono y actualizar bot_profile.
```

Dejar para después:

```txt
- Soporte avanzado para múltiples formatos de fecha.
- Análisis de audios.
- Análisis de imágenes.
- Detección automática perfecta de negocio vs cliente.
- Agrupación avanzada por embeddings.
- Dashboard de métricas profundas.
```

---

## 19. Estructura sugerida de carpetas

```txt
src/modules/chat-analysis/
│
├── controllers/
│   ├── chat-imports.controller.ts
│   ├── faq-suggestions.controller.ts
│   └── tone-analysis.controller.ts
│
├── services/
│   ├── chat-import.service.ts
│   ├── whatsapp-chat-parser.service.ts
│   ├── chat-anonymizer.service.ts
│   ├── tone-analysis.service.ts
│   ├── faq-detection.service.ts
│   └── chat-analysis-ai.service.ts
│
├── workers/
│   └── chat-import-analysis.worker.ts
│
├── dto/
│   ├── create-chat-import.dto.ts
│   ├── approve-faq-suggestion.dto.ts
│   ├── update-faq-suggestion.dto.ts
│   └── approve-tone-analysis.dto.ts
│
└── types/
    ├── parsed-chat-message.type.ts
    ├── tone-analysis-result.type.ts
    └── detected-faq.type.ts
```

---

## 20. Descripción corta para Codex

```txt
Agregar módulo backend llamado chat-analysis para ConversAI. Este módulo debe permitir subir chats exportados de WhatsApp en formato .txt o .zip, parsear mensajes, identificar cliente vs negocio, anonimizar datos sensibles, analizar con IA el tono de respuesta del negocio, detectar preguntas frecuentes repetidas, generar respuestas sugeridas imitando el tono del negocio y permitir que el usuario apruebe, edite o rechace esas sugerencias. Las FAQs aprobadas deben integrarse con la tabla FAQ existente y el tono aprobado debe actualizar el perfil del bot existente.
```
