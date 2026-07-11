# Guía paso a paso: migrar el backend a AWS (piloto staging)

Guía detallada para desplegar el backend `chat-whatsapp-ai` en AWS y conectarlo con Supabase, Vercel y Meta WhatsApp.

**Dominio de este proyecto:**

| Qué | URL |
|-----|-----|
| UI (Vercel) | `https://conversai.easycomp.cl` |
| API + webhook Meta (AWS) | `https://api.conversai.easycomp.cl` |
| Webhook WhatsApp | `https://api.conversai.easycomp.cl/webhooks/whatsapp` |

**Arquitectura final:**

```txt
Usuario WhatsApp
  → Meta Cloud API
  → api.conversai.easycomp.cl (AWS ALB → ECS API)
  → Redis (Upstash) cola BullMQ
  → ECS Workers (mismo contenedor, otro comando)
  → Supabase Postgres (Prisma)
  → OpenAI
  → respuesta WhatsApp

Operador en navegador
  → conversai.easycomp.cl (Vercel UI)
  → Supabase (auth + realtime)
  → api.conversai.easycomp.cl (API interna con X-API-Key)
```

---

## Antes de empezar: checklist de lo que ya debes tener

Marca cada ítem antes de entrar a AWS:

- [ ] Cuenta AWS activa (tarjeta configurada)
- [ ] Proyecto Supabase creado con `pgvector` activo
- [ ] `DATABASE_URL` de Supabase funcionando en local
- [ ] Migraciones Prisma aplicadas (`npm run prisma:migrate`)
- [ ] Migraciones SQL de la UI aplicadas en la misma base (`profiles`, views, RLS)
- [ ] Proyecto UI desplegado en Vercel (aunque sea con URL temporal)
- [ ] App de prueba en Meta Developer con WhatsApp configurado
- [ ] Dominio `easycomp.cl` con acceso al panel DNS de tu hosting
- [ ] Docker instalado en tu PC
- [ ] AWS CLI instalado (`aws --version`)

**Tiempo estimado total:** 3–6 horas la primera vez (incluye esperas de DNS y certificados).

**Costo estimado piloto (mensual):**

| Servicio | Costo aprox. |
|----------|--------------|
| ECS Fargate (1 task pequeño) | USD 15–25 |
| ALB | USD 18–22 |
| ECR + logs | USD 1–5 |
| Upstash Redis free tier | USD 0 |
| Supabase | según tu plan |
| **Total AWS piloto** | **~USD 35–50/mes** |

---

## Paso 0 — Instalar y configurar AWS CLI

### 0.1 Instalar AWS CLI

Windows (PowerShell como administrador):

```powershell
winget install Amazon.AWSCLI
```

Cierra y abre la terminal. Verifica:

```powershell
aws --version
```

### 0.2 Crear usuario IAM (no uses la cuenta root)

1. Entra a [AWS Console](https://console.aws.amazon.com) → **IAM** → **Users** → **Create user**.
2. Nombre: `easycomp-deploy`.
3. Permisos: adjunta estas políticas (piloto; después puedes restringir):
   - `AmazonEC2ContainerRegistryFullAccess`
   - `AmazonECS_FullAccess`
   - `ElasticLoadBalancingFullAccess`
   - `AmazonVPCFullAccess`
   - `IAMFullAccess` (solo piloto; en prod usa roles más acotados)
   - `SecretsManagerReadWrite`
   - `CloudWatchLogsFullAccess`
   - `AWSCertificateManagerFullAccess`
4. Crea **Access Key** → guarda `Access Key ID` y `Secret Access Key` en un lugar seguro.

### 0.3 Configurar credenciales en tu PC

```powershell
aws configure
```

Responde:

```txt
AWS Access Key ID: <tu-access-key>
AWS Secret Access Key: <tu-secret-key>
Default region name: sa-east-1
Default output format: json
```

> **Región `sa-east-1` (São Paulo)** es la más cercana a Chile. Usa siempre la misma región en todos los pasos.

Verifica:

```powershell
aws sts get-caller-identity
```

Debe mostrar tu Account ID (número de 12 dígitos). **Anótalo**, lo usarás en varios pasos:

```txt
ACCOUNT_ID = _______________
REGION     = sa-east-1
```

---

## Paso 1 — Crear Redis en Upstash (cola de mensajes)

Redis es **obligatorio**. Sin él el webhook recibe mensajes pero el bot no los procesa.

### 1.1 Crear base Redis

1. Entra a [upstash.com](https://upstash.com) → crea cuenta.
2. **Create Database** → región más cercana (ej. `sa-east-1` o `us-east-1`).
3. Tipo: **Regional** (más barato para piloto).
4. Copia la URL **TLS** (empieza con `rediss://`).

Guárdala:

```txt
REDIS_URL = rediss://default:xxxxx@xxxxx.upstash.io:6379
```

### 1.2 Probar que funciona (opcional)

No hace falta instalar nada. Solo verifica que la URL esté copiada completa, con contraseña incluida.

- [ ] Redis creado
- [ ] `REDIS_URL` guardada

---

## Paso 2 — Preparar todas las variables de entorno

Abre tu `.env` local y arma un documento privado (NOTAS, 1Password, etc.) con **todos** estos valores. No los subas a GitHub.

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=<connection-string-supabase>
REDIS_URL=<upstash-redis-url>
WHATSAPP_VERIFY_TOKEN=<inventa-un-token-secreto-largo>
WHATSAPP_GRAPH_VERSION=v20.0
META_APP_SECRET=<desde-meta-developer-app-settings>
META_SYSTEM_USER_ACCESS_TOKEN=<desde-meta-business>
OPENAI_API_KEY=<tu-key>
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
ENCRYPTION_SECRET=<minimo-32-caracteres-aleatorios>
INTERNAL_API_KEY=<otro-secreto-largo-aleatorio>
FAQ_SIMILARITY_THRESHOLD=0.80
STORAGE_PATH=/app/storage
SHOPIFY_API_VERSION=2024-10
SKIP_WEBHOOK_SIGNATURE=false
DEFAULT_TIMEZONE=America/Santiago
```

### Reglas importantes

| Variable | Regla |
|----------|-------|
| `WHATSAPP_VERIFY_TOKEN` | Lo inventas tú. Debe coincidir con lo que pongas en Meta. |
| `INTERNAL_API_KEY` | Debe ser **idéntico** a `BOT_API_SECRET` en Vercel. |
| `ENCRYPTION_SECRET` | Mínimo 32 caracteres. **No lo cambies** después de guardar tokens WhatsApp cifrados. |
| `SKIP_WEBHOOK_SIGNATURE` | Siempre `false` en cloud. |
| `DATABASE_URL` | Desde Supabase → Settings → Database → Connection string (URI). |

Generar secretos aleatorios en PowerShell:

```powershell
# INTERNAL_API_KEY
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})

# ENCRYPTION_SECRET (48 chars)
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})

# WHATSAPP_VERIFY_TOKEN
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

- [ ] Todas las variables anotadas en lugar seguro
- [ ] `INTERNAL_API_KEY` copiado también para Vercel

---

## Paso 3 — Crear repositorio de imágenes Docker (ECR)

ECR es donde AWS guarda tu imagen Docker del backend.

```powershell
cd C:\Users\ISRAEL\Desktop\EasyComp\Projects\chat-whatsapp-ai

aws ecr create-repository `
  --repository-name chat-whatsapp-ai `
  --region sa-east-1
```

Anota la URI que devuelve (o constrúyela):

```txt
ECR_URI = <ACCOUNT_ID>.dkr.ecr.sa-east-1.amazonaws.com/chat-whatsapp-ai
```

- [ ] Repositorio ECR creado

---

## Paso 4 — Build y subir la imagen Docker

### 4.1 Login en ECR

```powershell
aws ecr get-login-password --region sa-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.sa-east-1.amazonaws.com
```

Debe decir `Login Succeeded`.

### 4.2 Build

```powershell
docker build -t chat-whatsapp-ai .
```

Espera a que termine sin errores (puede tardar varios minutos la primera vez).

### 4.3 Tag y push

```powershell
docker tag chat-whatsapp-ai:latest <ACCOUNT_ID>.dkr.ecr.sa-east-1.amazonaws.com/chat-whatsapp-ai:latest

docker push <ACCOUNT_ID>.dkr.ecr.sa-east-1.amazonaws.com/chat-whatsapp-ai:latest
```

Verifica en AWS Console → **ECR** → `chat-whatsapp-ai` → debe aparecer la imagen `latest`.

- [ ] Imagen en ECR

---

## Paso 5 — Guardar secretos en AWS Secrets Manager

En lugar de pegar variables en texto plano en ECS, las guardamos en Secrets Manager.

### 5.1 Crear el secreto (consola AWS)

1. **Secrets Manager** → **Store a new secret**.
2. Tipo: **Other type of secret**.
3. Key/value: agrega cada variable del Paso 2 como par clave-valor.
4. Nombre del secreto: `chat-whatsapp-ai/staging`.
5. Crear.

Anota el ARN del secreto (aparece en la página del secreto):

```txt
SECRET_ARN = arn:aws:secretsmanager:sa-east-1:<ACCOUNT_ID>:secret:chat-whatsapp-ai/staging-xxxxx
```

### 5.2 Alternativa por CLI (más rápido si tienes un archivo)

Crea un archivo temporal `secrets.json` (NO lo commitees):

```json
{
  "NODE_ENV": "production",
  "PORT": "3000",
  "DATABASE_URL": "postgresql://...",
  "REDIS_URL": "rediss://...",
  "WHATSAPP_VERIFY_TOKEN": "...",
  "WHATSAPP_GRAPH_VERSION": "v20.0",
  "META_APP_SECRET": "...",
  "META_SYSTEM_USER_ACCESS_TOKEN": "...",
  "OPENAI_API_KEY": "...",
  "OPENAI_MODEL": "gpt-4o-mini",
  "OPENAI_EMBEDDING_MODEL": "text-embedding-3-small",
  "ENCRYPTION_SECRET": "...",
  "INTERNAL_API_KEY": "...",
  "FAQ_SIMILARITY_THRESHOLD": "0.80",
  "STORAGE_PATH": "/app/storage",
  "SHOPIFY_API_VERSION": "2024-10",
  "SKIP_WEBHOOK_SIGNATURE": "false",
  "DEFAULT_TIMEZONE": "America/Santiago"
}
```

```powershell
aws secretsmanager create-secret `
  --name chat-whatsapp-ai/staging `
  --secret-string file://secrets.json `
  --region sa-east-1
```

Borra `secrets.json` después.

- [ ] Secreto creado en Secrets Manager

---

## Paso 6 — Red y cluster ECS

### 6.1 Crear cluster ECS

Consola AWS → **ECS** → **Clusters** → **Create cluster**:

- Nombre: `easycomp-staging`
- Infrastructure: **AWS Fargate (serverless)**
- Crear

### 6.2 VPC por defecto (piloto simple)

Para el piloto puedes usar la **VPC default** de tu cuenta en `sa-east-1`:

Consola → **VPC** → anota:

```txt
VPC_ID            = vpc-xxxxxxxx
SUBNET_PUBLIC_1   = subnet-xxxxxxxx  (sa-east-1a)
SUBNET_PUBLIC_2   = subnet-xxxxxxxx  (sa-east-1b)
```

Necesitas al menos 2 subnets en zonas distintas para el ALB.

- [ ] Cluster ECS creado
- [ ] VPC y subnets anotadas

---

## Paso 7 — Certificado HTTPS (ACM)

Meta exige HTTPS en el webhook.

### 7.1 Solicitar certificado

Consola → **Certificate Manager (ACM)** → región **sa-east-1** → **Request certificate**:

- Tipo: **Public certificate**
- Dominio: `api.conversai.easycomp.cl`
- Validación: **DNS validation**

### 7.2 Validar en tu hosting DNS

ACM te muestra un registro CNAME, algo como:

```txt
_nombre-random.api.conversai.easycomp.cl  →  _nombre-random.acm-validations.aws.
```

En el panel DNS de `easycomp.cl` (tu hosting), agrega ese CNAME.

Espera 5–30 minutos hasta que el certificado diga **Issued**.

- [ ] Certificado ACM en estado **Issued**

---

## Paso 8 — Application Load Balancer (ALB)

### 8.1 Crear ALB

Consola → **EC2** → **Load Balancers** → **Create**:

| Campo | Valor |
|-------|-------|
| Tipo | Application Load Balancer |
| Nombre | `easycomp-api-staging` |
| Scheme | Internet-facing |
| IP | IPv4 |
| VPC | tu VPC default |
| Subnets | las 2 públicas |
| Security group | crear nuevo: `easycomp-alb-sg` |

**Security group del ALB** (`easycomp-alb-sg`):

| Tipo | Puerto | Origen |
|------|--------|--------|
| HTTP | 80 | 0.0.0.0/0 |
| HTTPS | 443 | 0.0.0.0/0 |

### 8.2 Target group

En el wizard o después:

- Target type: **IP addresses**
- Protocol: HTTP, puerto **3000**
- VPC: la misma
- Health check path: `/health`
- Healthy threshold: 2
- Interval: 30 s

Nombre sugerido: `easycomp-api-tg`

### 8.3 Listeners

- **HTTPS :443** → forward al target group → certificado ACM de `api.conversai.easycomp.cl`
- **HTTP :80** → redirect a HTTPS (opcional pero recomendado)

Anota el DNS del ALB:

```txt
ALB_DNS = easycomp-api-staging-xxxxxxxx.sa-east-1.elb.amazonaws.com
```

- [ ] ALB creado y activo
- [ ] Target group creado

---

## Paso 9 — Task Definition y servicio ECS (piloto combinado)

Para el **primer piloto** usamos un solo servicio con `npm start` (API + workers juntos). Es más simple; después separas.

### 9.1 Crear rol de ejecución (si no existe)

Consola → **IAM** → **Roles** → busca `ecsTaskExecutionRole`.

Si no existe, créalo con la política `AmazonECSTaskExecutionRolePolicy` y además permiso para leer Secrets Manager (`SecretsManagerReadWrite` en el secreto o inline policy).

### 9.2 Task Definition

Consola → **ECS** → **Task definitions** → **Create**:

| Campo | Valor |
|-------|-------|
| Family | `chat-whatsapp-ai-staging` |
| Launch type | Fargate |
| CPU | 0.5 vCPU (512) |
| Memory | 1 GB (1024) |
| Execution role | `ecsTaskExecutionRole` |
| Task role | `ecsTaskExecutionRole` (piloto) |

**Container:**

| Campo | Valor |
|-------|-------|
| Name | `api` |
| Image URI | `<ACCOUNT_ID>.dkr.ecr.sa-east-1.amazonaws.com/chat-whatsapp-ai:latest` |
| Port | 3000 TCP |
| Command override | `npm,start` |

> `npm,start` en la consola ECS = comando `npm` con argumento `start` (API + workers).

**Environment / Secrets:**

En la sección de secrets del contenedor, mapea cada variable desde Secrets Manager:

- `DATABASE_URL` → ARN del secreto:key `DATABASE_URL::`
- Repite para todas las variables del Paso 2.

Formato en consola: selecciona el secreto y la key correspondiente.

**Logging:**

- Log driver: `awslogs`
- Log group: `/ecs/chat-whatsapp-ai` (créalo si no existe)
- Region: `sa-east-1`
- Stream prefix: `ecs`

### 9.3 Security group del servicio ECS

Crear `easycomp-ecs-sg`:

| Tipo | Puerto | Origen |
|------|--------|--------|
| Custom TCP | 3000 | security group del ALB (`easycomp-alb-sg`) |

No abras el puerto 3000 a internet directamente; solo el ALB habla con ECS.

### 9.4 Crear servicio ECS

**ECS** → cluster `easycomp-staging` → **Create service**:

| Campo | Valor |
|-------|-------|
| Launch type | Fargate |
| Task definition | `chat-whatsapp-ai-staging` |
| Service name | `chat-whatsapp-ai-combined` |
| Desired tasks | 1 |
| VPC | default |
| Subnets | públicas (piloto) |
| Public IP | **ON** (piloto sin NAT) |
| Security group | `easycomp-ecs-sg` |
| Load balancer | Application Load Balancer |
| Target group | `easycomp-api-tg` |
| Container | `api:3000` |

Espera a que el servicio quede **Running** y el target group muestre **healthy**.

- [ ] Task definition creada
- [ ] Servicio ECS corriendo
- [ ] Target healthy en ALB

---

## Paso 10 — DNS: apuntar `api.conversai.easycomp.cl` al ALB

En el panel DNS de tu hosting (`easycomp.cl`):

| Tipo | Nombre/Host | Valor |
|------|-------------|-------|
| CNAME | `api.conversai` | `easycomp-api-staging-xxxxxxxx.sa-east-1.elb.amazonaws.com` |

> Algunos hostings piden el host como `api.conversai` y otros como `api.conversai.easycomp.cl`. Usa el formato que tu panel indique.

Espera propagación DNS (5 min – 2 h).

### 10.1 Probar health check

```powershell
curl https://api.conversai.easycomp.cl/health
```

Respuesta esperada:

```json
{"ok":true,"db":"up"}
```

**Si `db: "down"`:**

- Revisa `DATABASE_URL` en Secrets Manager.
- En Supabase, prueba connection string **directo** (puerto 5432) vs **pooler** (6543).
- Revisa que Supabase permita conexiones externas (no esté pausado el proyecto).

**Si no resuelve el dominio:**

- Verifica el CNAME en [dnschecker.org](https://dnschecker.org).

- [ ] `/health` responde OK por HTTPS

---

## Paso 11 — Configurar Vercel (UI)

En el proyecto UI en Vercel → **Settings** → **Environment Variables**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
BOT_API_BASE_URL=https://api.conversai.easycomp.cl
BOT_API_SECRET=<mismo valor que INTERNAL_API_KEY>
```

### Dominio UI

Vercel → **Domains** → agregar `conversai.easycomp.cl`.

Vercel te dará un registro DNS. En tu hosting:

| Tipo | Host | Valor (ejemplo) |
|------|------|-----------------|
| CNAME | `conversai` | `cname.vercel-dns.com` |

Redeploy la UI después de cambiar variables.

- [ ] Variables en Vercel configuradas
- [ ] Dominio `conversai.easycomp.cl` activo

---

## Paso 12 — Configurar webhook en Meta

1. [Meta for Developers](https://developers.facebook.com) → tu app → **WhatsApp** → **Configuration**.
2. **Callback URL:**

   ```txt
   https://api.conversai.easycomp.cl/webhooks/whatsapp
   ```

3. **Verify token:** el mismo que `WHATSAPP_VERIFY_TOKEN`.
4. Click **Verify and save**.
5. Suscríbete al campo **`messages`**.

Si falla la verificación:

| Error | Causa probable |
|-------|----------------|
| No llega el challenge | DNS o ALB mal configurado |
| Token inválido | `WHATSAPP_VERIFY_TOKEN` distinto entre Meta y Secrets Manager |
| Timeout | ECS no está healthy |

- [ ] Webhook verificado en Meta

---

## Paso 13 — Sembrar negocio y vincular WhatsApp

Si aún no tienes tenant en la BD de staging:

```powershell
$headers = @{
  "X-API-Key" = "<INTERNAL_API_KEY>"
  "Content-Type" = "application/json"
}

# Crear negocio
Invoke-RestMethod -Method POST `
  -Uri "https://api.conversai.easycomp.cl/businesses" `
  -Headers $headers `
  -Body '{"name":"EasyComp Piloto","slug":"easycomp-piloto","botName":"Asistente","botTone":"profesional y cercano"}'
```

Guarda el `id` del negocio y luego vincula WhatsApp:

```powershell
Invoke-RestMethod -Method POST `
  -Uri "https://api.conversai.easycomp.cl/businesses/<BUSINESS_ID>/whatsapp-accounts" `
  -Headers $headers `
  -Body '{"phone_number_id":"<PHONE_NUMBER_ID>","phone_number":"+56...","access_token":"<TOKEN>"}'
```

Los valores `phone_number_id` y `access_token` salen de Meta Developer / WhatsApp Business.

- [ ] Negocio creado en BD
- [ ] Cuenta WhatsApp vinculada

---

## Paso 14 — Prueba end-to-end

Marca cada prueba:

### API

```powershell
curl https://api.conversai.easycomp.cl/health
```

- [ ] `ok: true`, `db: up`

### UI

- [ ] Login en `https://conversai.easycomp.cl`
- [ ] Dashboard carga sin error de `BOT_API_BASE_URL`
- [ ] No aparece `Unauthorized`

### WhatsApp

- [ ] Envías mensaje al número de prueba de Meta
- [ ] Aparece fila nueva en tabla `Message` (Supabase Table Editor)
- [ ] Aparece en la UI en tiempo real
- [ ] El bot responde en WhatsApp

### Logs si algo falla

Consola → **CloudWatch** → **Log groups** → `/ecs/chat-whatsapp-ai` → último stream.

Busca errores como:

- `DATABASE_UNAVAILABLE` → problema de conexión Supabase
- `Message worker job failed` → error en pipeline del bot
- `Webhook enqueue error` → Redis mal configurado

---

## Paso 15 — Mejora: separar API y Workers (staging estable)

Cuando el piloto funcione, crea **un segundo servicio** ECS con la misma imagen:

| Servicio | Comando | ALB | Tasks |
|----------|---------|-----|-------|
| `chat-whatsapp-ai-api` | `npm run start:api` | Sí | 1+ |
| `chat-whatsapp-ai-workers` | `npm run start:workers` | No | 1+ |

Pasos:

1. Duplica la task definition cambiando el comando.
2. Crea servicio workers **sin** load balancer.
3. Apaga el servicio combinado `chat-whatsapp-ai-combined`.

Ambos servicios deben usar el **mismo** Secrets Manager y la **misma** `REDIS_URL`.

---

## Paso 16 — Producción (cuando staging esté estable)

No copies staging a prod. Duplica infraestructura:

| Recurso | Staging | Producción |
|---------|---------|------------|
| Supabase | proyecto staging | **proyecto nuevo** prod |
| Redis Upstash | DB staging | DB prod |
| Secrets Manager | `chat-whatsapp-ai/staging` | `chat-whatsapp-ai/production` |
| ECS cluster | `easycomp-staging` | `easycomp-prod` |
| Dominio API | `api.conversai.easycomp.cl` | `api.conversai.easycomp.cl` o subdominio prod |
| Meta | app de prueba | app / número prod |
| Vercel | preview/staging env | production env |

---

## Paso 17 — GitHub → deploy automático (siguiente iteración)

Hoy el deploy es manual (build + push ECR + update service). El siguiente paso es un workflow `.github/workflows/deploy-staging.yml` que:

1. Hace `docker build` en CI.
2. Push a ECR.
3. Fuerza nuevo deployment en ECS.

Eso se puede agregar después de que el piloto manual funcione.

---

## Resumen visual del orden

```txt
 1. AWS CLI configurado
 2. Upstash Redis
 3. Variables secretas anotadas
 4. ECR + docker push
 5. Secrets Manager
 6. ECS cluster
 7. Certificado ACM + validación DNS
 8. ALB + target group
 9. Task definition + servicio ECS
10. DNS api.conversai → ALB
11. curl /health
12. Vercel BOT_API_* + dominio conversai
13. Meta webhook verify
14. Crear negocio + WhatsApp
15. Mensaje de prueba
16. (Opcional) Separar API/workers
17. (Después) CI/CD GitHub + prod
```

---

## Troubleshooting rápido

| Síntoma | Qué revisar |
|---------|-------------|
| `/health` → `db: down` | `DATABASE_URL`, proyecto Supabase activo, IP allowlist |
| Webhook Meta no verifica | DNS, certificado ACM, `WHATSAPP_VERIFY_TOKEN` |
| Mensaje llega pero bot no responde | Redis `REDIS_URL`, logs del worker, tenant WhatsApp vinculado |
| UI no carga conversaciones | `BOT_API_SECRET` ≠ `INTERNAL_API_KEY`, Supabase RLS |
| 502 en ALB | ECS task no healthy, revisa logs CloudWatch |
| Task ECS se reinicia | Error al arrancar: falta variable en Secrets Manager |

---

## Documentos relacionados

- `docs/deploy-staging-backend.md` — variables y checklist técnico
- `docs/spec-cursor-migracion-backend-staging.md` — spec completa de migración
- `README_META_APP_PRUEBAS_LOCALES.md` — configuración Meta en local

---

## Notas sobre storage (fase 2)

Para subir PDFs de knowledge o imports de chat en cloud, el disco local (`STORAGE_PATH`) no sirve en Fargate. Opciones:

1. **Supabase Storage** (recomendado) — requiere adaptar `storage.service.ts`
2. **EFS montado en `/app/storage`** — funciona sin cambiar código, más caro

Para el piloto solo de mensajes WhatsApp (sin uploads), puedes ignorar storage por ahora.
