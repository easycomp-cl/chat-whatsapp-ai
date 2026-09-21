import { KnowledgeDocumentStatus } from "@prisma/client";
import type {
  OnboardingChecklistKey,
  OnboardingDraft,
  OnboardingPatch,
  OnboardingSetupMetadata,
  SetupStatusResponse
} from "./onboarding.types.js";
import {
  ONBOARDING_DESCRIPTION_MAX,
  ONBOARDING_DESCRIPTION_MIN,
  ONBOARDING_SETUP_VERSION
} from "./onboarding.types.js";
import { isOnboardingRequired } from "./onboarding-config.js";
import { isHttpsLogoUrl } from "./logo-url.js";
import { isScheduleParseable } from "./schedule.js";

const E164_PHONE = /^\+[1-9]\d{6,14}$/;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asDraft(value: unknown): OnboardingDraft {
  const record = asRecord(value);
  return record as OnboardingDraft;
}

export function createInitialSetupMetadata(): OnboardingSetupMetadata {
  return {
    version: ONBOARDING_SETUP_VERSION,
    started_at: new Date().toISOString(),
    completed_at: null,
    current_step: 1,
    draft_updated_at: null,
    draft: {},
    checklist: {},
    generated: {
      profile_document_id: null,
      seed_faq_ids: [],
      catalog_product_ids: []
    }
  };
}

export function parseSetupMetadata(metadataJson: unknown): OnboardingSetupMetadata {
  const record = asRecord(metadataJson);
  const setup = asRecord(record.setup);
  const draft = asDraft(setup.draft);
  const checklist = asRecord(setup.checklist) as Partial<Record<OnboardingChecklistKey, boolean>>;
  const generated = asRecord(setup.generated);
  const currentStepRaw = setup.current_step;
  const currentStep =
    typeof currentStepRaw === "number" && Number.isInteger(currentStepRaw) && currentStepRaw >= 1 && currentStepRaw <= 5
      ? currentStepRaw
      : 1;

  return {
    version: typeof setup.version === "number" ? setup.version : ONBOARDING_SETUP_VERSION,
    started_at:
      typeof setup.started_at === "string" ? setup.started_at : new Date().toISOString(),
    completed_at: typeof setup.completed_at === "string" ? setup.completed_at : null,
    current_step: currentStep,
    draft_updated_at: typeof setup.draft_updated_at === "string" ? setup.draft_updated_at : null,
    draft,
    checklist,
    generated: {
      profile_document_id:
        typeof generated.profile_document_id === "string" ? generated.profile_document_id : null,
      seed_faq_ids: Array.isArray(generated.seed_faq_ids)
        ? generated.seed_faq_ids.filter((id): id is string => typeof id === "string")
        : [],
      catalog_product_ids: Array.isArray(generated.catalog_product_ids)
        ? generated.catalog_product_ids.filter((id): id is string => typeof id === "string")
        : []
    }
  };
}

export function mergeOnboardingDraft(
  existing: OnboardingDraft,
  patch: OnboardingPatch
): OnboardingDraft {
  const next: OnboardingDraft = { ...existing };

  if (patch.identity) {
    const { logo_url: logoUrlPatch, ...identityRest } = patch.identity;
    next.identity = { ...existing.identity, ...identityRest };
    if (logoUrlPatch === null) {
      next.identity.logo_url = null;
    } else if (isHttpsLogoUrl(logoUrlPatch)) {
      next.identity.logo_url = logoUrlPatch.trim();
    }
  }

  if (patch.offerings !== undefined) {
    next.offerings = patch.offerings;
  }

  if (patch.operations) {
    next.operations = { ...existing.operations, ...patch.operations };
    const region = next.operations.region?.trim() || next.operations.city?.trim();
    if (region) {
      next.operations.region = region;
      if (!next.operations.city?.trim()) {
        next.operations.city = region;
      }
    }
  }

  if (patch.human_contact) {
    const previousPhone = existing.human_contact?.admin_phone?.trim();
    const nextPhone = patch.human_contact.admin_phone?.trim();
    next.human_contact = { ...existing.human_contact, ...patch.human_contact };
    if (nextPhone && previousPhone && nextPhone !== previousPhone) {
      next.human_contact.admin_phone_verified_at = null;
    }
  }

  if (patch.bot_identity) {
    next.bot_identity = { ...existing.bot_identity, ...patch.bot_identity };
  }

  return next;
}

export function resolveUseNamedAgent(draft: OnboardingDraft): boolean {
  if (draft.bot_identity?.use_named_agent != null) {
    return draft.bot_identity.use_named_agent;
  }
  return Boolean(draft.bot_identity?.bot_name?.trim());
}

export function isE164Phone(value: string | undefined): boolean {
  return Boolean(value && E164_PHONE.test(value.trim()));
}

export function computeChecklist(input: {
  draft: OnboardingDraft;
  hasActiveWhatsappChannel: boolean;
  profileDocumentStatus?: KnowledgeDocumentStatus | null;
  hasPrimaryAdmin?: boolean;
  tenantBotName?: string;
}): Record<OnboardingChecklistKey, boolean> {
  const { draft } = input;
  const name = draft.identity?.business_name?.trim() ?? "";
  const description = draft.identity?.description?.trim() ?? "";
  const identityDone =
    name.length >= 2 &&
    Boolean(draft.identity?.business_type) &&
    description.length >= ONBOARDING_DESCRIPTION_MIN &&
    description.length <= ONBOARDING_DESCRIPTION_MAX;

  const offerings = draft.offerings ?? [];
  const offeringsDone =
    offerings.length >= 1 &&
    offerings.every(
      (item) =>
        Boolean(item.name?.trim()) && (item.description?.trim().length ?? 0) >= 10
    );

  const operationsDone =
    isScheduleParseable(draft.operations?.schedule) &&
    (draft.operations?.payment_methods?.filter((method) => method.trim()).length ?? 0) >= 1;

  const humanContactDone =
    Boolean(draft.human_contact?.admin_name?.trim()) && isE164Phone(draft.human_contact?.admin_phone);

  const greeting = draft.bot_identity?.greeting_message?.trim() ?? "";
  const botIdentityDone =
    greeting.length >= 10 &&
    (!resolveUseNamedAgent(draft) || Boolean(draft.bot_identity?.bot_name?.trim()));

  const knowledgeIndexed = input.profileDocumentStatus === KnowledgeDocumentStatus.INDEXED;

  return {
    identity: identityDone,
    offerings: offeringsDone,
    operations: operationsDone,
    human_contact: humanContactDone,
    bot_identity: botIdentityDone,
    whatsapp_channel: input.hasActiveWhatsappChannel,
    knowledge_indexed: knowledgeIndexed
  };
}

const REQUIRED_FOR_GO_LIVE: OnboardingChecklistKey[] = [
  "identity",
  "offerings",
  "operations",
  "human_contact",
  "bot_identity"
];

export function missingRequiredSections(
  checklist: Record<OnboardingChecklistKey, boolean>
): string[] {
  return REQUIRED_FOR_GO_LIVE.filter((key) => !checklist[key]);
}

export function buildSetupStatus(input: {
  setup: OnboardingSetupMetadata;
  checklist: Record<OnboardingChecklistKey, boolean>;
  botGlobalEnabled: boolean;
  allowGoLiveWithoutChannel: boolean;
  currentStep?: number;
  draftUpdatedAt?: string | null;
  completedAt?: string | null;
}): SetupStatusResponse {
  const missing = missingRequiredSections(input.checklist);

  if (!input.allowGoLiveWithoutChannel && !input.checklist.whatsapp_channel) {
    missing.push("whatsapp_channel");
  }

  const requiredKeys: OnboardingChecklistKey[] = input.allowGoLiveWithoutChannel
    ? REQUIRED_FOR_GO_LIVE
    : [...REQUIRED_FOR_GO_LIVE, "whatsapp_channel"];

  const doneCount = requiredKeys.filter((key) => input.checklist[key]).length;
  const progressPercent = Math.round((doneCount / requiredKeys.length) * 100);
  const sectionsComplete = missing.length === 0;
  const onboardingRequired = isOnboardingRequired();

  const checklistResponse = {} as SetupStatusResponse["checklist"];
  const allKeys: OnboardingChecklistKey[] = [
    "identity",
    "offerings",
    "operations",
    "human_contact",
    "bot_identity",
    "whatsapp_channel",
    "knowledge_indexed"
  ];

  for (const key of allKeys) {
    checklistResponse[key] = {
      done: input.checklist[key],
      required: requiredKeys.includes(key)
    };
  }

  const currentStep = input.currentStep ?? input.setup.current_step ?? 1;

  return {
    setup_version: input.setup.version,
    completed_at: input.completedAt ?? input.setup.completed_at ?? null,
    progress_percent: onboardingRequired ? progressPercent : 100,
    can_go_live: onboardingRequired ? sectionsComplete : true,
    onboarding_required: onboardingRequired,
    bot_global_enabled: input.botGlobalEnabled,
    current_step: currentStep >= 1 && currentStep <= 5 ? currentStep : 1,
    draft_updated_at: input.draftUpdatedAt ?? input.setup.draft_updated_at ?? null,
    checklist: checklistResponse,
    missing_for_go_live: missing,
    draft: input.setup.draft ?? {}
  };
}

export function isDraftMeaningful(draft: OnboardingDraft | undefined): boolean {
  if (!draft) return false;
  return Object.keys(draft).length > 0;
}
