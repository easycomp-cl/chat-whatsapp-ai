# Supabase Storage — Archivos de flujos

**Bucket:** `flow-files`  
**Uso:** logos/archivos de clientes en flujos, outputs generados  
**Acceso:** Backend con **service role**; UI con URLs firmadas generadas por backend

---

## 1. Crear bucket (Dashboard o SQL)

En Supabase SQL Editor:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'flow-files',
  'flow-files',
  false,
  10485760, -- 10 MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'image/svg+xml'
  ]
)
ON CONFLICT (id) DO NOTHING;
```

---

## 2. Convención de paths

```text
flow-files/
  tenants/{tenantId}/
    conversations/{conversationId}/
      runs/{flowRunId}/
        inbound/{messageExternalId}/{filename}
        outbound/{flowFileId}/{filename}
```

El backend persiste la ruta en `FlowFile.storagePath` (sin prefijo del bucket).

---

## 3. Políticas RLS (Storage)

El bucket es **privado**. El frontend **no** sube directo en MVP; todo pasa por backend con service role.

Políticas mínimas (defensa en profundidad si alguien intenta usar anon key):

```sql
-- Lectura: solo service role en la práctica; bloquear anon/authenticated
CREATE POLICY "flow_files_no_public_read"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (false);

-- Escritura: bloquear clientes directos
CREATE POLICY "flow_files_no_public_insert"
ON storage.objects FOR INSERT
TO authenticated, anon
WITH CHECK (false);

CREATE POLICY "flow_files_no_public_update"
ON storage.objects FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE POLICY "flow_files_no_public_delete"
ON storage.objects FOR DELETE
TO authenticated, anon
USING (false);
```

El backend usa `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS).

---

## 4. URLs firmadas (backend)

Flujo:

1. Backend sube archivo con service role → `FlowFile` en Postgres
2. Para preview en UI: `createSignedUrl(storagePath, expiresIn: 3600)`
3. Endpoint sugerido: `GET /businesses/:businessId/flow-files/:fileId/signed-url`

Nunca exponer `service_role` al frontend.

---

## 5. Variables de entorno

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_FLOW_FILES_BUCKET=flow-files
```

Agregar a ECS Secrets Manager en deploy (mismos valores que proyecto Supabase de la UI).

---

## 6. Cómo probar

1. Ejecutar SQL de bucket en Supabase
2. Configurar env en backend local
3. Script/manual: subir archivo de prueba a `tenants/{tenantId}/...`
4. Verificar fila en `FlowFile` y signed URL accesible

---

## 7. Dependencias UI

- Mostrar preview con URL firmada devuelta por backend
- No configurar upload directo a Storage desde el browser en MVP
- Globo de revisión de logo: `GET signed-url` del `FlowFile` referenciado en `FlowReview.subjectReference`
