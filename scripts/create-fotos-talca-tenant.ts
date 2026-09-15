/**
 * Crea tenant "Fotos Talca", usuario login audio@visual.cl y mueve el canal WA actual.
 *
 * Uso:
 *   npx tsx scripts/create-fotos-talca-tenant.ts
 *   npx tsx scripts/create-fotos-talca-tenant.ts --dry-run
 */
import dotenv from "dotenv";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient, TenantStatus } from "@prisma/client";
import { onboardingService } from "../src/modules/onboarding/onboarding.service.js";
import { isOnboardingRequired } from "../src/modules/onboarding/onboarding-config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const dryRun = process.argv.includes("--dry-run");

const BUSINESS = {
  name: "Fotos Talca",
  slug: "fotos-talca",
  businessType: "audiovisual",
  botName: "Foto",
  botTone: "profesional y cercano",
  adminName: "Admin Fotos Talca",
  adminEmail: "audio@visual.cl",
  adminPassword: "123456"
};

const CURRENT_PHONE_NUMBER_ID = "1245403151983186";
const PREVIOUS_TENANT_ID = "cmrgmk5vf0000gbngos6i7jnt";

const prisma = new PrismaClient();

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }

  const channel = await prisma.tenantChannel.findUnique({
    where: { phoneNumberId: CURRENT_PHONE_NUMBER_ID },
    include: { tenant: true }
  });

  if (!channel) {
    throw new Error(`No se encontró canal WhatsApp phoneNumberId=${CURRENT_PHONE_NUMBER_ID}`);
  }

  const existingEmail = await prisma.$queryRawUnsafe<Array<{ id: string; email: string }>>(
    `SELECT id, email FROM auth.users WHERE lower(email) = lower($1) LIMIT 1`,
    BUSINESS.adminEmail
  );

  if (existingEmail.length) {
    throw new Error(`Ya existe usuario auth con email ${BUSINESS.adminEmail}`);
  }

  const existingSlug = await prisma.tenant.findUnique({ where: { slug: BUSINESS.slug } });
  if (existingSlug) {
    throw new Error(`Ya existe tenant con slug ${BUSINESS.slug} (id=${existingSlug.id})`);
  }

  console.log(
    JSON.stringify(
      {
        dry_run: dryRun,
        action: "create tenant + move whatsapp channel + create auth user",
        channel: {
          phone: channel.phoneNumber,
          phoneNumberId: channel.phoneNumberId,
          from_tenant: { id: channel.tenantId, name: channel.tenant.name }
        },
        new_business: BUSINESS,
        bot_global_enabled: !isOnboardingRequired()
      },
      null,
      2
    )
  );

  if (dryRun) {
    console.log("\n(dry-run) No se aplicaron cambios.");
    return;
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: BUSINESS.name,
      slug: BUSINESS.slug,
      businessType: BUSINESS.businessType,
      status: TenantStatus.ACTIVE,
      botGlobalEnabled: !isOnboardingRequired(),
      metadataJson: onboardingService.ensureInitialSetupMetadata(null),
      config: {
        create: {
          botName: BUSINESS.botName,
          botTone: BUSINESS.botTone,
          greetingMessage: `Hola, soy ${BUSINESS.botName} de ${BUSINESS.name}. ¿En qué te ayudamos?`,
          fallbackMessage: "No tengo esa información confirmada todavía.",
          handoffMessage: "Te conecto con un asesor de Fotos Talca en breve.",
          outOfHoursMessage: "Estamos fuera de horario. Te responderemos pronto."
        }
      }
    }
  });

  await prisma.tenantFaq.createMany({
    data: [
      {
        tenantId: tenant.id,
        question: "¿Qué servicios ofrecen?",
        answer:
          "Fotos Talca es una agencia de audio visual. Ofrecemos producción de video, fotografía, streaming y contenido para marcas y eventos en Talca y la región.",
        category: "onboarding_seed",
        priority: 0,
        isActive: true
      },
      {
        tenantId: tenant.id,
        question: "¿Cómo puedo hablar con una persona?",
        answer: 'Escribe "hablar con asesor" y te conectamos con el equipo.',
        category: "onboarding_seed",
        priority: 1,
        isActive: true
      }
    ]
  });

  const movedChannel = await prisma.tenantChannel.update({
    where: { id: channel.id },
    data: {
      tenantId: tenant.id,
      isActive: true,
      status: "ACTIVE"
    }
  });

  await prisma.tenant.update({
    where: { id: PREVIOUS_TENANT_ID },
    data: { botGlobalEnabled: false }
  });

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: BUSINESS.adminEmail,
    password: BUSINESS.adminPassword,
    email_confirm: true,
    user_metadata: { full_name: BUSINESS.adminName }
  });

  if (authError || !authData.user) {
    throw new Error(`Error creando usuario auth: ${authError?.message ?? "sin user"}`);
  }

  const profileId = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO public.profiles (id, user_id, business_id, full_name, role, agent_id, active, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5::public.user_role, NULL, true, now(), now())`,
    profileId,
    authData.user.id,
    tenant.id,
    BUSINESS.adminName,
    "BUSINESS_ADMIN"
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
        whatsapp: {
          phone: movedChannel.phoneNumber,
          phoneNumberId: movedChannel.phoneNumberId,
          tenantId: movedChannel.tenantId
        },
        login: {
          email: BUSINESS.adminEmail,
          role: "BUSINESS_ADMIN",
          user_id: authData.user.id,
          profile_id: profileId
        },
        previous_tenant: {
          id: PREVIOUS_TENANT_ID,
          note: "Canal WA movido; bot_global_enabled=false"
        },
        ui_url_hint: "https://chatbotmanager.easycomp.cl/login"
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
