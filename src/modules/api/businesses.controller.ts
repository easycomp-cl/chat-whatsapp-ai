import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { encryptionService } from "../../lib/encryption.service.js";
import { faqEngine } from "../faq/faq.engine.js";
import { buildFaqSearchText } from "../faq/faq-search-text.js";
import { mergeKnowledgeConfig, parseTenantKnowledgeConfig } from "../tenants/tenant-knowledge-config.js";
import { paramId } from "../../utils/params.js";
import { requireTenantFaq } from "../../utils/tenant-resource.js";

const createBusinessSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  businessType: z.string().default("general"),
  timezone: z.string().default("America/Santiago"),
  botName: z.string().min(1),
  botTone: z.string().default("profesional y cercano")
});

const settingsSchema = z.object({
  bot_global_enabled: z.boolean().optional(),
  confidence_threshold: z.number().min(0).max(1).optional(),
  default_ai_model: z.string().optional(),
  knowledge: z
    .object({
      enabled: z.boolean().optional(),
      top_k: z.number().int().min(1).max(20).optional(),
      chunk_size: z.number().int().min(100).max(2000).optional(),
      chunk_overlap: z.number().int().min(0).max(500).optional(),
      min_confidence: z.number().min(0).max(1).optional(),
      faq_similarity_threshold: z.number().min(0).max(1).optional(),
      auto_index_on_create: z.boolean().optional()
    })
    .optional()
});

const whatsappAccountSchema = z.object({
  phone_number_id: z.string().min(1),
  phone_number: z.string().min(1),
  waba_id: z.string().optional(),
  access_token: z.string().min(1),
  verify_token: z.string().optional(),
  coexistence_enabled: z.boolean().optional()
});

const agentSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  role: z.string().default("agent"),
  notify_on_handoff: z.boolean().default(true),
  is_primary: z.boolean().default(false)
});

export async function listBusinesses(_req: Request, res: Response) {
  const tenants = await prisma.tenant.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      botGlobalEnabled: true,
      defaultAiModel: true,
      confidenceThreshold: true,
      timezone: true,
      createdAt: true,
      updatedAt: true
    }
  });
  res.json(
    tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      bot_global_enabled: t.botGlobalEnabled,
      default_ai_model: t.defaultAiModel,
      confidence_threshold: t.confidenceThreshold,
      timezone: t.timezone,
      created_at: t.createdAt,
      updated_at: t.updatedAt
    }))
  );
}

export async function createBusiness(req: Request, res: Response) {
  const body = createBusinessSchema.parse(req.body);
  const tenant = await prisma.tenant.create({
    data: {
      name: body.name,
      slug: body.slug,
      businessType: body.businessType,
      timezone: body.timezone,
      config: {
        create: {
          botName: body.botName,
          botTone: body.botTone,
          greetingMessage: `Hola, soy ${body.botName} de ${body.name}.`,
          fallbackMessage: "No tengo esa información confirmada todavía.",
          handoffMessage: "Déjame revisarlo con un asesor y te respondemos en breve.",
          outOfHoursMessage: "Estamos fuera de horario."
        }
      }
    },
    include: { config: true }
  });
  res.status(201).json(tenant);
}

export async function getBusiness(req: Request, res: Response) {
  const id = paramId(req, "id");
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: { config: true, channels: true, admins: { where: { isActive: true } } }
  });
  if (!tenant) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  res.json({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    bot_global_enabled: tenant.botGlobalEnabled,
    default_ai_model: tenant.defaultAiModel,
    confidence_threshold: tenant.confidenceThreshold,
    timezone: tenant.timezone,
    config: tenant.config,
    whatsapp_accounts: tenant.channels,
    agents: tenant.admins
  });
}

export async function patchBusinessSettings(req: Request, res: Response) {
  const id = paramId(req, "id");
  const body = settingsSchema.parse(req.body);

  const existing = await prisma.tenant.findUnique({
    where: { id },
    include: { config: true }
  });
  if (!existing?.config) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  let knowledgeConfigJson: Prisma.InputJsonValue | undefined;
  if (body.knowledge) {
    knowledgeConfigJson = mergeKnowledgeConfig(existing.config.configJson, {
      ...(body.knowledge.enabled !== undefined && { enabled: body.knowledge.enabled }),
      ...(body.knowledge.top_k !== undefined && { topK: body.knowledge.top_k }),
      ...(body.knowledge.chunk_size !== undefined && { chunkSize: body.knowledge.chunk_size }),
      ...(body.knowledge.chunk_overlap !== undefined && { chunkOverlap: body.knowledge.chunk_overlap }),
      ...(body.knowledge.min_confidence !== undefined && { minConfidence: body.knowledge.min_confidence }),
      ...(body.knowledge.faq_similarity_threshold !== undefined && {
        faqSimilarityThreshold: body.knowledge.faq_similarity_threshold
      }),
      ...(body.knowledge.auto_index_on_create !== undefined && {
        autoIndexOnCreate: body.knowledge.auto_index_on_create
      })
    });
  }

  const tenant = await prisma.tenant.update({
    where: { id },
    data: {
      ...(body.bot_global_enabled !== undefined && { botGlobalEnabled: body.bot_global_enabled }),
      ...(body.confidence_threshold !== undefined && { confidenceThreshold: body.confidence_threshold }),
      ...(body.default_ai_model !== undefined && { defaultAiModel: body.default_ai_model })
    }
  });

  if (knowledgeConfigJson) {
    await prisma.tenantConfig.update({
      where: { tenantId: id },
      data: { configJson: knowledgeConfigJson }
    });
  }

  const config = body.knowledge
    ? await prisma.tenantConfig.findUnique({ where: { tenantId: id } })
    : existing.config;

  res.json({
    id: tenant.id,
    bot_global_enabled: tenant.botGlobalEnabled,
    confidence_threshold: tenant.confidenceThreshold,
    default_ai_model: tenant.defaultAiModel,
    knowledge: parseTenantKnowledgeConfig(config?.configJson)
  });
}

export async function createWhatsappAccount(req: Request, res: Response) {
  const id = paramId(req, "id");
  const body = whatsappAccountSchema.parse(req.body);
  const encrypted = encryptionService.encrypt(body.access_token);
  const channel = await prisma.tenantChannel.upsert({
    where: { phoneNumberId: body.phone_number_id },
    create: {
      tenantId: id,
      phoneNumberId: body.phone_number_id,
      phoneNumber: body.phone_number,
      wabaId: body.waba_id ?? null,
      accessTokenEncrypted: encrypted,
      verifyToken: body.verify_token ?? null,
      coexistenceEnabled: body.coexistence_enabled ?? false,
      status: "ACTIVE"
    },
    update: {
      phoneNumber: body.phone_number,
      wabaId: body.waba_id ?? null,
      accessTokenEncrypted: encrypted,
      verifyToken: body.verify_token ?? null,
      coexistenceEnabled: body.coexistence_enabled ?? false,
      status: "ACTIVE",
      isActive: true
    }
  });
  res.status(201).json(channel);
}

export async function createAgent(req: Request, res: Response) {
  const id = paramId(req, "id");
  const body = agentSchema.parse(req.body);
  const agent = await prisma.tenantAdmin.create({
    data: {
      tenantId: id,
      name: body.name,
      phoneNumber: body.phone,
      role: body.role,
      notifyOnHandoff: body.notify_on_handoff,
      isPrimary: body.is_primary
    }
  });
  res.status(201).json(agent);
}

const patchAgentSchema = agentSchema.partial().extend({
  active: z.boolean().optional()
});

export async function patchAgent(req: Request, res: Response) {
  const id = paramId(req, "id");
  const body = patchAgentSchema.parse(req.body);
  const agent = await prisma.tenantAdmin.update({
    where: { id },
    data: {
      ...(body.name && { name: body.name }),
      ...(body.phone && { phoneNumber: body.phone }),
      ...(body.role && { role: body.role }),
      ...(body.notify_on_handoff !== undefined && { notifyOnHandoff: body.notify_on_handoff }),
      ...(body.is_primary !== undefined && { isPrimary: body.is_primary }),
      ...(body.active !== undefined && { isActive: body.active })
    }
  });
  res.json(agent);
}

export async function listFaqs(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const faqs = await prisma.tenantFaq.findMany({
    where: { tenantId: businessId },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }]
  });
  res.json(faqs);
}

const faqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  category: z.string().optional(),
  priority: z.number().int().default(0),
  active: z.boolean().default(true),
  alternate_phrases: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional()
});

export async function createFaq(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const body = faqSchema.parse(req.body);
  const searchText = buildFaqSearchText({
    question: body.question,
    alternatePhrases: body.alternate_phrases,
    keywords: body.keywords
  });
  const faq = await prisma.tenantFaq.create({
    data: {
      tenantId: businessId,
      question: body.question,
      answer: body.answer,
      category: body.category ?? null,
      priority: body.priority,
      isActive: body.active,
      alternatePhrases: body.alternate_phrases ?? [],
      keywords: body.keywords ?? [],
      searchText
    }
  });
  await faqEngine.indexFaqEmbedding(faq.id);
  res.status(201).json(faq);
}

export async function patchFaq(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const id = paramId(req, "id");
  const existing = await requireTenantFaq(req, res, id, businessId);
  if (!existing) {
    return;
  }

  const body = faqSchema.partial().parse(req.body);
  const current = await prisma.tenantFaq.findUnique({ where: { id } });
  const searchText = buildFaqSearchText({
    question: body.question ?? current?.question ?? "",
    alternatePhrases: body.alternate_phrases ?? current?.alternatePhrases,
    keywords: body.keywords ?? current?.keywords
  });

  const faq = await prisma.tenantFaq.update({
    where: { id },
    data: {
      ...(body.question && { question: body.question }),
      ...(body.answer && { answer: body.answer }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.active !== undefined && { isActive: body.active }),
      ...(body.alternate_phrases !== undefined && { alternatePhrases: body.alternate_phrases }),
      ...(body.keywords !== undefined && { keywords: body.keywords }),
      searchText
    }
  });
  await faqEngine.indexFaqEmbedding(faq.id);
  res.json(faq);
}

export async function deleteFaq(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const id = paramId(req, "id");
  const existing = await requireTenantFaq(req, res, id, businessId);
  if (!existing) {
    return;
  }
  await prisma.tenantFaq.delete({ where: { id } });
  res.status(204).send();
}
