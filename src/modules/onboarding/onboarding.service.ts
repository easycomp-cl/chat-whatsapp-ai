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
import { persistOnboardingDraftState } from "./onboarding-draft.store.js";
import { isHttpsLogoUrl } from "./logo-url.js";
import type { OnboardingDraft, OnboardingPatch } from "./onboarding.types.js";
import {
  buildSetupStatus,
  computeChecklist,
  createInitialSetupMetadata,
  isDraftMeaningful,
  mergeOnboardingDraft,
  missingRequiredSections,
  parseSetupMetadata
} from "./setup-status.service.js";

function allowGoLiveWithoutChannel(): boolean {
  return process.env.ALLOW_GO_LIVE_WITHOUT_CHANNEL === "true";
}

function textByteSize(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function asDraftJson(value: Prisma.JsonValue | null | undefined): OnboardingDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as OnboardingDraft;
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

function hydrateDraftPresentation(
  draft: OnboardingDraft,
  input: { logoUrl?: string | null; primaryAdmin?: Parameters<typeof hydrateHumanContactFromAdmin>[1] }
): OnboardingDraft {
  const next = hydrateHumanContactFromAdmin(draft, input.primaryAdmin);
  const storedLogo = next.identity?.logo_url;
  if (storedLogo === null) {
    return next;
  }
  if (!isHttpsLogoUrl(storedLogo) && isHttpsLogoUrl(input.logoUrl)) {
    return {
      ...next,
      identity: {
        ...next.identity,
        logo_url: input.logoUrl
      }
    };
  }
  return next;
}

function resolveLogoUpdate(patch: OnboardingPatch): string | null | undefined {
  if (!patch.identity || !("logo_url" in patch.identity)) return undefined;
  if (patch.identity.logo_url === null) return null;
  if (isHttpsLogoUrl(patch.identity.logo_url)) return patch.identity.logo_url.trim();
  return undefined;
}

const tenantSetupInclude = {
  config: true,
  onboardingDraft: true,
  channels: { where: { isActive: true, status: "ACTIVE" as const }, take: 1 },
  admins: { where: { isActive: true, isPrimary: true }, take: 1 }
} satisfies Prisma.TenantInclude;

export class OnboardingService {
  async getSetupStatus(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: tenantSetupInclude
    });

    if (!tenant) {
      return null;
    }

    return this.buildStatusFromTenant(tenant);
  }

  private async resolveProfileDocumentStatus(tenantId: string, profileDocumentId?: string | null) {
    const profileDoc = profileDocumentId
      ? await prisma.tenantDocument.findUnique({
          where: { id: profileDocumentId },
          select: { status: true }
        })
      : await prisma.tenantDocument.findFirst({
          where: { tenantId, title: ONBOARDING_PROFILE_DOCUMENT_TITLE },
          select: { status: true }
        });
    return profileDoc?.status ?? null;
  }

  async patchDraft(tenantId: string, patch: OnboardingPatch) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: tenantSetupInclude
    });
    if (!tenant) return null;

    const loaded = this.loadDraftState(tenant);
    const nextDraft = mergeOnboardingDraft(loaded.draft, patch);
    const previousPhone = loaded.draft.human_contact?.admin_phone?.trim();
    const nextPhone = nextDraft.human_contact?.admin_phone?.trim();
    const currentStep = patch.current_step ?? loaded.currentStep;
    const logoUrl = resolveLogoUpdate(patch);

    if (previousPhone && nextPhone && previousPhone !== nextPhone) {
      await prisma.tenantAdmin.updateMany({
        where: { tenantId, phoneNumber: previousPhone },
        data: { phoneVerifiedAt: null }
      });
    }

    await persistOnboardingDraftState(prisma, {
      tenantId,
      metadataJson: tenant.metadataJson,
      setup: loaded.setup,
      draft: nextDraft,
      currentStep,
      ...(logoUrl !== undefined ? { logoUrl } : {})
    });

    return this.getSetupStatus(tenantId);
  }

  async complete(input: {
    tenantId: string;
    enableBot: boolean;
    handoffOnLowConfidence: boolean;
  }) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: input.tenantId },
      include: tenantSetupInclude
    });
    if (!tenant?.config) return { error: "not_found" as const };

    const status = await this.buildStatusFromTenant(tenant);
    const missing = [...missingRequiredSections(this.checklistFromStatus(status))];
    if (!allowGoLiveWithoutChannel() && !status.checklist.whatsapp_channel.done) {
      missing.push("whatsapp_channel");
    }
    if (missing.length > 0) {
      return {
        error: "incomplete" as const,
        status: {
          ...status,
          missing_for_go_live: missing,
          can_go_live: false
        }
      };
    }

    const loaded = this.loadDraftState(tenant);
    const draft = loaded.draft;
    const businessName = draft.identity?.business_name?.trim() || tenant.name;
    const profileText = buildBusinessProfileDocument({
      businessName,
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

      const seedFaqs = buildSeedFaqs({ businessName, draft });
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
      const wasCompleted = Boolean(loaded.setup.completed_at || tenant.onboardingCompletedAt);
      if (!wasCompleted) {
        for (const offering of draft.offerings ?? []) {
          const name = offering.name?.trim();
          if (!name) continue;
          const product = await tx.tenantCatalogProduct.create({
            data: {
              tenantId: input.tenantId,
              name,
              description: offering.description?.trim() || null,
              price: offering.price ?? null,
              currency: offering.currency ?? "CLP",
              source: CatalogProductSource.MANUAL,
              isActive: true
            }
          });
          catalogProductIds.push(product.id);
        }
      } else {
        catalogProductIds.push(...(loaded.setup.generated?.catalog_product_ids ?? []));
      }

      const completedAt = new Date();
      const nextSetup = {
        ...loaded.setup,
        draft,
        current_step: loaded.currentStep,
        draft_updated_at: loaded.draftUpdatedAt,
        completed_at: completedAt.toISOString(),
        generated: {
          profile_document_id: document.id,
          seed_faq_ids: faqIds,
          catalog_product_ids: catalogProductIds
        }
      };

      const publishedLogo =
        isHttpsLogoUrl(draft.identity?.logo_url) ? draft.identity.logo_url.trim() : tenant.logoUrl;

      await tx.tenant.update({
        where: { id: input.tenantId },
        data: {
          name: businessName,
          ...(draft.identity?.business_type ? { businessType: draft.identity.business_type } : {}),
          ...(publishedLogo !== undefined ? { logoUrl: publishedLogo } : {}),
          onboardingCompletedAt: completedAt,
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
      completed_at: result.completedAt.toISOString(),
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

  private loadDraftState(tenant: {
    metadataJson: Prisma.JsonValue | null;
    updatedAt: Date;
    onboardingCompletedAt?: Date | null;
    onboardingDraft?: {
      currentStep: number;
      draftJson: Prisma.JsonValue;
      draftUpdatedAt: Date;
    } | null;
  }) {
    const setup = parseSetupMetadata(tenant.metadataJson);
    const tableDraft = tenant.onboardingDraft;
    const draft = tableDraft ? asDraftJson(tableDraft.draftJson) : setup.draft;
    const currentStep = tableDraft?.currentStep ?? setup.current_step ?? 1;
    const draftUpdatedAt =
      tableDraft?.draftUpdatedAt.toISOString() ??
      setup.draft_updated_at ??
      (isDraftMeaningful(draft) ? tenant.updatedAt.toISOString() : null);

    return {
      setup: {
        ...setup,
        draft,
        current_step: currentStep,
        draft_updated_at: draftUpdatedAt,
        completed_at: tenant.onboardingCompletedAt?.toISOString() ?? setup.completed_at ?? null
      },
      draft,
      currentStep,
      draftUpdatedAt
    };
  }

  private async buildStatusFromTenant(tenant: {
    id: string;
    metadataJson: Prisma.JsonValue | null;
    updatedAt: Date;
    botGlobalEnabled: boolean;
    logoUrl?: string | null;
    onboardingCompletedAt?: Date | null;
    onboardingDraft?: {
      currentStep: number;
      draftJson: Prisma.JsonValue;
      draftUpdatedAt: Date;
    } | null;
    config: { botName: string } | null;
    channels: unknown[];
    admins: Array<{
      name: string;
      phoneNumber: string;
      notifyOnHandoff: boolean;
      phoneVerifiedAt: Date | null;
    }>;
  }) {
    const loaded = this.loadDraftState(tenant);
    const draft = hydrateDraftPresentation(loaded.draft, {
      logoUrl: tenant.logoUrl ?? null,
      primaryAdmin: tenant.admins[0] ?? null
    });
    const setup = { ...loaded.setup, draft };
    const profileDocumentStatus = await this.resolveProfileDocumentStatus(
      tenant.id,
      setup.generated?.profile_document_id
    );

    const checklist = computeChecklist({
      draft,
      hasActiveWhatsappChannel: tenant.channels.length > 0,
      profileDocumentStatus,
      hasPrimaryAdmin: tenant.admins.length > 0,
      ...(tenant.config?.botName ? { tenantBotName: tenant.config.botName } : {})
    });

    return buildSetupStatus({
      setup,
      checklist,
      botGlobalEnabled: tenant.botGlobalEnabled,
      allowGoLiveWithoutChannel: allowGoLiveWithoutChannel(),
      currentStep: setup.current_step,
      draftUpdatedAt: setup.draft_updated_at,
      completedAt: setup.completed_at
    });
  }

  private checklistFromStatus(status: Awaited<ReturnType<OnboardingService["getSetupStatus"]>>) {
    if (!status) {
      return computeChecklist({
        draft: {},
        hasActiveWhatsappChannel: false,
        hasPrimaryAdmin: false
      });
    }
    return {
      identity: status.checklist.identity.done,
      offerings: status.checklist.offerings.done,
      operations: status.checklist.operations.done,
      human_contact: status.checklist.human_contact.done,
      bot_identity: status.checklist.bot_identity.done,
      whatsapp_channel: status.checklist.whatsapp_channel.done,
      knowledge_indexed: status.checklist.knowledge_indexed.done
    };
  }
}

export const onboardingService = new OnboardingService();
