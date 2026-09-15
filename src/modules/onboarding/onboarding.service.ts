import {
  CatalogProductSource,
  KnowledgeDocumentStatus,
  KnowledgeSourceType,
  Prisma
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { faqEngine } from "../faq/faq.engine.js";
import { buildFaqSearchText } from "../faq/faq-search-text.js";
import { enqueueKnowledgeIndex } from "../queue/knowledge-index.queue.js";
import { mergeBotPersonalityConfigJson } from "../tenants/bot-personality.service.js";
import {
  buildBusinessProfileDocument,
  buildSeedFaqs,
  ONBOARDING_PROFILE_DOCUMENT_TITLE,
  ONBOARDING_SEED_FAQ_CATEGORY
} from "./business-profile.builder.js";
import type { OnboardingDraft } from "./onboarding.types.js";
import {
  buildSetupStatus,
  computeChecklist,
  createInitialSetupMetadata,
  mergeOnboardingDraft,
  parseSetupMetadata
} from "./setup-status.service.js";

function allowGoLiveWithoutChannel(): boolean {
  return process.env.ALLOW_GO_LIVE_WITHOUT_CHANNEL === "true";
}

function textByteSize(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function hydrateHumanContactFromAdmin(
  draft: OnboardingDraft,
  primaryAdmin?: {
    name: string;
    phoneNumber: string;
    notifyOnHandoff: boolean;
    phoneVerifiedAt: Date | null;
  } | null
): OnboardingDraft {
  if (!primaryAdmin) return draft;
  return {
    ...draft,
    human_contact: {
      ...draft.human_contact,
      admin_phone: draft.human_contact?.admin_phone ?? primaryAdmin.phoneNumber,
      admin_name: draft.human_contact?.admin_name ?? primaryAdmin.name,
      notify_on_handoff: draft.human_contact?.notify_on_handoff ?? primaryAdmin.notifyOnHandoff,
      admin_phone_verified_at: primaryAdmin.phoneVerifiedAt?.toISOString() ?? null
    }
  };
}

export class OnboardingService {
  async getSetupStatus(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        config: true,
        channels: { where: { isActive: true, status: "ACTIVE" }, take: 1 },
        admins: { where: { isActive: true, isPrimary: true }, take: 1 }
      }
    });

    if (!tenant) {
      return null;
    }

    const setup = parseSetupMetadata(tenant.metadataJson);
    setup.draft = hydrateHumanContactFromAdmin(setup.draft, tenant.admins[0] ?? null);
    const profileDoc = setup.generated?.profile_document_id
      ? await prisma.tenantDocument.findUnique({
          where: { id: setup.generated.profile_document_id },
          select: { status: true }
        })
      : await prisma.tenantDocument.findFirst({
          where: { tenantId, title: ONBOARDING_PROFILE_DOCUMENT_TITLE },
          select: { id: true, status: true }
        });

    const checklist = computeChecklist({
      draft: setup.draft,
      hasActiveWhatsappChannel: tenant.channels.length > 0,
      profileDocumentStatus: profileDoc?.status ?? null,
      hasPrimaryAdmin: tenant.admins.length > 0,
      ...(tenant.config?.botName ? { tenantBotName: tenant.config.botName } : {})
    });

    return buildSetupStatus({
      setup,
      checklist,
      botGlobalEnabled: tenant.botGlobalEnabled,
      allowGoLiveWithoutChannel: allowGoLiveWithoutChannel()
    });
  }

  async patchDraft(tenantId: string, patch: OnboardingDraft) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        config: true,
        channels: { where: { isActive: true, status: "ACTIVE" }, take: 1 },
        admins: { where: { isActive: true, isPrimary: true }, take: 1 }
      }
    });
    if (!tenant) return null;

    const setup = parseSetupMetadata(tenant.metadataJson);
    const nextDraft = mergeOnboardingDraft(setup.draft, patch);
    const previousPhone = setup.draft.human_contact?.admin_phone?.trim();
    const nextPhone = nextDraft.human_contact?.admin_phone?.trim();

    if (previousPhone && nextPhone && previousPhone !== nextPhone) {
      await prisma.tenantAdmin.updateMany({
        where: { tenantId, phoneNumber: previousPhone },
        data: { phoneVerifiedAt: null }
      });
    }

    const nextSetup = {
      ...setup,
      draft: nextDraft
    };

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        metadataJson: {
          ...(tenant.metadataJson as Prisma.InputJsonObject),
          setup: nextSetup
        } as Prisma.InputJsonValue
      }
    });

    return this.getSetupStatus(tenantId);
  }

  async complete(input: {
    tenantId: string;
    enableBot: boolean;
    handoffOnLowConfidence: boolean;
  }) {
    const status = await this.getSetupStatus(input.tenantId);
    if (!status) return { error: "not_found" as const };
    if (!status.can_go_live) {
      return { error: "incomplete" as const, status };
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: input.tenantId },
      include: { config: true }
    });
    if (!tenant?.config) return { error: "not_found" as const };

    const setup = parseSetupMetadata(tenant.metadataJson);
    const draft = setup.draft;
    const profileText = buildBusinessProfileDocument({
      businessName: tenant.name,
      draft
    });

    const result = await prisma.$transaction(async (tx) => {
      const botName = draft.bot_identity?.bot_name?.trim() || tenant.config!.botName;
      const botTone = draft.bot_identity?.bot_tone?.trim() || tenant.config!.botTone;
      const greetingMessage =
        draft.bot_identity?.greeting_message?.trim() || tenant.config!.greetingMessage;

      const mergedConfigJson = mergeBotPersonalityConfigJson(tenant.config!.configJson, {
        handoff_on_low_confidence: input.handoffOnLowConfidence
      });

      await tx.tenantConfig.update({
        where: { tenantId: input.tenantId },
        data: {
          botName,
          botTone,
          greetingMessage,
          configJson: mergedConfigJson
        }
      });

      if (draft.human_contact?.admin_phone) {
        const adminPhone = draft.human_contact.admin_phone.trim();
        const adminName = draft.human_contact.admin_name?.trim() || "Administrador";
        const verifiedAtRaw = draft.human_contact.admin_phone_verified_at;
        const phoneVerifiedAt =
          typeof verifiedAtRaw === "string" && verifiedAtRaw
            ? new Date(verifiedAtRaw)
            : undefined;
        await tx.tenantAdmin.upsert({
          where: {
            tenantId_phoneNumber: {
              tenantId: input.tenantId,
              phoneNumber: adminPhone
            }
          },
          create: {
            tenantId: input.tenantId,
            name: adminName,
            phoneNumber: adminPhone,
            isPrimary: true,
            notifyOnHandoff: draft.human_contact.notify_on_handoff ?? true,
            ...(phoneVerifiedAt && !Number.isNaN(phoneVerifiedAt.getTime())
              ? { phoneVerifiedAt }
              : {})
          },
          update: {
            name: adminName,
            isPrimary: true,
            notifyOnHandoff: draft.human_contact.notify_on_handoff ?? true,
            isActive: true,
            ...(phoneVerifiedAt && !Number.isNaN(phoneVerifiedAt.getTime())
              ? { phoneVerifiedAt }
              : {})
          }
        });
      }

      const existingDoc = await tx.tenantDocument.findFirst({
        where: { tenantId: input.tenantId, title: ONBOARDING_PROFILE_DOCUMENT_TITLE }
      });

      const document = existingDoc
        ? await tx.tenantDocument.update({
            where: { id: existingDoc.id },
            data: {
              rawText: profileText,
              fileSize: textByteSize(profileText),
              status: KnowledgeDocumentStatus.PENDING,
              indexError: null
            }
          })
        : await tx.tenantDocument.create({
            data: {
              tenantId: input.tenantId,
              title: ONBOARDING_PROFILE_DOCUMENT_TITLE,
              sourceType: KnowledgeSourceType.MANUAL,
              rawText: profileText,
              fileSize: textByteSize(profileText),
              status: KnowledgeDocumentStatus.PENDING
            }
          });

      const seedFaqs = buildSeedFaqs({ businessName: tenant.name, draft });
      const faqIds: string[] = [];

      for (const [index, faq] of seedFaqs.entries()) {
        const searchText = buildFaqSearchText({
          question: faq.question,
          alternatePhrases: faq.alternatePhrases,
          keywords: faq.keywords
        });

        const existingFaq = await tx.tenantFaq.findFirst({
          where: {
            tenantId: input.tenantId,
            category: ONBOARDING_SEED_FAQ_CATEGORY,
            question: faq.question
          }
        });

        const saved = existingFaq
          ? await tx.tenantFaq.update({
              where: { id: existingFaq.id },
              data: {
                answer: faq.answer,
                alternatePhrases: faq.alternatePhrases,
                keywords: faq.keywords,
                searchText,
                isActive: true,
                priority: index
              }
            })
          : await tx.tenantFaq.create({
              data: {
                tenantId: input.tenantId,
                question: faq.question,
                answer: faq.answer,
                category: faq.category,
                priority: index,
                alternatePhrases: faq.alternatePhrases,
                keywords: faq.keywords,
                searchText,
                isActive: true
              }
            });

        faqIds.push(saved.id);
      }

      const catalogProductIds: string[] = [];
      const wasCompleted = Boolean(setup.completed_at);
      if (!wasCompleted) {
        for (const offering of draft.offerings ?? []) {
          const product = await tx.tenantCatalogProduct.create({
            data: {
              tenantId: input.tenantId,
              name: offering.name,
              description: offering.description,
              price: offering.price ?? null,
              currency: offering.currency ?? "CLP",
              source: CatalogProductSource.MANUAL,
              isActive: true
            }
          });
          catalogProductIds.push(product.id);
        }
      } else {
        catalogProductIds.push(...(setup.generated?.catalog_product_ids ?? []));
      }

      const completedAt = new Date().toISOString();
      const nextSetup = {
        ...setup,
        draft,
        completed_at: completedAt,
        generated: {
          profile_document_id: document.id,
          seed_faq_ids: faqIds,
          catalog_product_ids: catalogProductIds
        }
      };

      await tx.tenant.update({
        where: { id: input.tenantId },
        data: {
          ...(input.enableBot ? { botGlobalEnabled: true } : {}),
          metadataJson: {
            ...(tenant.metadataJson as Prisma.InputJsonObject),
            setup: nextSetup
          } as Prisma.InputJsonValue
        }
      });

      return { documentId: document.id, faqIds, catalogProductIds, completedAt };
    });

    for (const faqId of result.faqIds) {
      await faqEngine.indexFaqEmbedding(faqId);
    }
    await enqueueKnowledgeIndex(result.documentId, input.tenantId);

    return {
      completed_at: result.completedAt,
      bot_global_enabled: input.enableBot,
      generated: {
        document_id: result.documentId,
        faq_ids: result.faqIds,
        catalog_product_ids: result.catalogProductIds
      },
      indexing: {
        document_status: KnowledgeDocumentStatus.PENDING,
        message: "El perfil se indexará en segundos. Las FAQs semilla ya están activas."
      }
    };
  }

  ensureInitialSetupMetadata(metadataJson: unknown): Prisma.InputJsonValue {
    const record =
      metadataJson && typeof metadataJson === "object" && !Array.isArray(metadataJson)
        ? (metadataJson as Record<string, unknown>)
        : {};

    if (record.setup) {
      return record as Prisma.InputJsonValue;
    }

    return {
      ...record,
      setup: createInitialSetupMetadata()
    } as Prisma.InputJsonValue;
  }
}

export const onboardingService = new OnboardingService();
