import { KnowledgeDocumentStatus } from "@prisma/client";
import type {
  OnboardingChecklistKey,
  OnboardingDraft,
  OnboardingSetupMetadata,
  SetupStatusResponse
} from "./onboarding.types.js";
import { ONBOARDING_SETUP_VERSION } from "./onboarding.types.js";
import { isOnboardingRequired } from "./onboarding-config.js";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function createInitialSetupMetadata(): OnboardingSetupMetadata {
  return {
    version: ONBOARDING_SETUP_VERSION,
    started_at: new Date().toISOString(),
    completed_at: null,
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
  const draft = asRecord(setup.draft) as OnboardingDraft;
  const checklist = asRecord(setup.checklist) as Partial<Record<OnboardingChecklistKey, boolean>>;
  const generated = asRecord(setup.generated);

  return {
    version: typeof setup.version === "number" ? setup.version : ONBOARDING_SETUP_VERSION,
    started_at:
      typeof setup.started_at === "string" ? setup.started_at : new Date().toISOString(),
    completed_at: typeof setup.completed_at === "string" ? setup.completed_at : null,
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
  patch: OnboardingDraft
): OnboardingDraft {
  const next: OnboardingDraft = { ...existing };

  if (patch.identity) {
    next.identity = { ...existing.identity, ...patch.identity };
  }
  if (patch.offerings !== undefined) {
    next.offerings = patch.offerings;
  }
  if (patch.operations) {
    next.operations = { ...existing.operations, ...patch.operations };
  }
  if (patch.human_contact) {
    next.human_contact = { ...existing.human_contact, ...patch.human_contact };
  }
  if (patch.bot_identity) {
    next.bot_identity = { ...existing.bot_identity, ...patch.bot_identity };
  }

  return next;
}

export function computeChecklist(input: {
  draft: OnboardingDraft;
  hasActiveWhatsappChannel: boolean;
  profileDocumentStatus?: KnowledgeDocumentStatus | null;
  hasPrimaryAdmin: boolean;
  tenantBotName?: string;
}): Record<OnboardingChecklistKey, boolean> {
  const { draft } = input;
  const identityDone = (draft.identity?.description?.trim().length ?? 0) >= 50;
  const offeringsDone =
    (draft.offerings?.length ?? 0) >= 1 &&
    draft.offerings!.every((o) => o.name.trim().length > 0 && o.description.trim().length >= 10);
  const operationsDone =
    Boolean(draft.operations?.schedule?.trim()) &&
    (draft.operations?.payment_methods?.length ?? 0) >= 1;
  const humanContactDone = Boolean(draft.human_contact?.admin_phone?.trim()) || input.hasPrimaryAdmin;
  const botIdentityDone =
    Boolean(draft.bot_identity?.bot_name?.trim()) || Boolean(input.tenantBotName?.trim());
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

export function buildSetupStatus(input: {
  setup: OnboardingSetupMetadata;
  checklist: Record<OnboardingChecklistKey, boolean>;
  botGlobalEnabled: boolean;
  allowGoLiveWithoutChannel: boolean;
}): SetupStatusResponse {
  const missing: string[] = [];
  for (const key of REQUIRED_FOR_GO_LIVE) {
    if (!input.checklist[key]) {
      missing.push(key);
    }
  }

  if (!input.allowGoLiveWithoutChannel && !input.checklist.whatsapp_channel) {
    missing.push("whatsapp_channel");
  }

  const requiredKeys: OnboardingChecklistKey[] = input.allowGoLiveWithoutChannel
    ? REQUIRED_FOR_GO_LIVE
    : [...REQUIRED_FOR_GO_LIVE, "whatsapp_channel"];

  const doneCount = requiredKeys.filter((key) => input.checklist[key]).length;
  const progressPercent = Math.round((doneCount / requiredKeys.length) * 100);
  const canGoLive = missing.length === 0;
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

  return {
    setup_version: input.setup.version,
    completed_at: input.setup.completed_at ?? null,
    progress_percent: onboardingRequired ? progressPercent : 100,
    can_go_live: onboardingRequired ? canGoLive : true,
    onboarding_required: onboardingRequired,
    bot_global_enabled: input.botGlobalEnabled,
    checklist: checklistResponse,
    missing_for_go_live: missing,
    draft: input.setup.draft
  };
}
