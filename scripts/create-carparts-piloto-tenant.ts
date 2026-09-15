/**
 * Crea tenant piloto EasyComp Repuestos + usuario de panel.
 * No completa el wizard de onboarding ni conecta WhatsApp.
 *
 *   npx tsx scripts/create-carparts-piloto-tenant.ts
 */
import dotenv from "dotenv";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient, TenantStatus } from "@prisma/client";
import { onboardingService } from "../src/modules/onboarding/onboarding.service.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const BUSINESS = {
  name: "EasyComp Repuestos",
  slug: "easycomp-repuestos",
  businessType: "products",
  botName: "Asistente",
  botTone: "profesional y cercano",
  adminName: "EasyComp Repuestos",
  adminEmail: "easycomp@carparts.cl",
  adminPassword: "123456"
};

const prisma = new PrismaClient();

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let tenant = await prisma.tenant.findUnique({
    where: { slug: BUSINESS.slug },
    include: { config: true }
  });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: BUSINESS.name,
        slug: BUSINESS.slug,
        businessType: BUSINESS.businessType,
        status: TenantStatus.ACTIVE,
        botGlobalEnabled: true,
        metadataJson: onboardingService.ensureInitialSetupMetadata(null),
        config: {
          create: {
            botName: BUSINESS.botName,
            botTone: BUSINESS.botTone,
            greetingMessage: `Hola, soy ${BUSINESS.botName} de ${BUSINESS.name}. ¿En qué te ayudamos?`,
            fallbackMessage: "No tengo esa información confirmada todavía.",
            handoffMessage: "Te conecto con un asesor en breve.",
            outOfHoursMessage: "Estamos fuera de horario. Te responderemos pronto."
          }
        }
      },
      include: { config: true }
    });
  }

  const existingEmail = await prisma.$queryRawUnsafe<Array<{ id: string; email: string }>>(
    `SELECT id, email FROM auth.users WHERE lower(email) = lower($1) LIMIT 1`,
    BUSINESS.adminEmail
  );

  let userId: string;
  if (existingEmail.length) {
    userId = existingEmail[0].id;
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: BUSINESS.adminPassword,
      email_confirm: true,
      user_metadata: { full_name: BUSINESS.adminName }
    });
    if (updateError) {
      throw new Error(`Error actualizando usuario auth: ${updateError.message}`);
    }
  } else {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: BUSINESS.adminEmail,
      password: BUSINESS.adminPassword,
      email_confirm: true,
      user_metadata: { full_name: BUSINESS.adminName }
    });
    if (authError || !authData.user) {
      throw new Error(`Error creando usuario auth: ${authError?.message ?? "sin user"}`);
    }
    userId = authData.user.id;
  }

  const existingProfile = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM public.profiles WHERE user_id = $1::uuid LIMIT 1`,
    userId
  );
  const profileId = existingProfile[0]?.id ?? randomUUID();
  if (existingProfile.length) {
    await prisma.$executeRawUnsafe(
      `UPDATE public.profiles
       SET business_id = $1,
           full_name = $2,
           role = $3::public.user_role,
           active = true,
           updated_at = now()
       WHERE user_id = $4::uuid`,
      tenant.id,
      BUSINESS.adminName,
      "BUSINESS_ADMIN",
      userId
    );
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.profiles (id, user_id, business_id, full_name, role, agent_id, active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::public.user_role, NULL, true, now(), now())`,
      profileId,
      userId,
      tenant.id,
      BUSINESS.adminName,
      "BUSINESS_ADMIN"
    );
  }

  const channelCount = await prisma.tenantChannel.count({ where: { tenantId: tenant.id } });
  const faqCount = await prisma.tenantFaq.count({ where: { tenantId: tenant.id } });

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
        login: {
          email: BUSINESS.adminEmail,
          role: "BUSINESS_ADMIN",
          user_id: userId,
          profile_id: profileId
        },
        whatsapp_channels: channelCount,
        faq_count: faqCount,
        onboarding_seeded: false,
        ui_login: "https://chatbotmanager.easycomp.cl/login",
        ui_whatsapp: "https://chatbotmanager.easycomp.cl/onboarding/whatsapp"
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
