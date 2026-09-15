export const ONBOARDING_SETUP_VERSION = 1;
export const ONBOARDING_SEED_FAQ_CATEGORY = "onboarding_seed";
export const ONBOARDING_PROFILE_DOCUMENT_TITLE = "Perfil del negocio";

export type BusinessType = "products" | "services" | "both";

export type OnboardingOffering = {
  type: "product" | "service";
  name: string;
  description: string;
  price?: number;
  currency?: string;
};

export type OnboardingDraft = {
  identity?: {
    business_type?: BusinessType;
    description?: string;
  };
  offerings?: OnboardingOffering[];
  operations?: {
    schedule?: string;
    city?: string;
    commune?: string;
    address?: string;
    payment_methods?: string[];
    delivery_notes?: string;
  };
  human_contact?: {
    admin_name?: string;
    admin_phone?: string;
    notify_on_handoff?: boolean;
    admin_phone_verified_at?: string | null;
  };
  bot_identity?: {
    bot_name?: string;
    bot_tone?: string;
    greeting_message?: string;
  };
};

export type OnboardingChecklistKey =
  | "identity"
  | "offerings"
  | "operations"
  | "human_contact"
  | "bot_identity"
  | "whatsapp_channel"
  | "knowledge_indexed";

export type OnboardingSetupMetadata = {
  version: number;
  started_at: string;
  completed_at?: string | null;
  draft: OnboardingDraft;
  checklist: Partial<Record<OnboardingChecklistKey, boolean>>;
  generated?: {
    profile_document_id?: string | null;
    seed_faq_ids?: string[];
    catalog_product_ids?: string[];
  };
};

export type SetupStatusResponse = {
  setup_version: number;
  completed_at: string | null;
  progress_percent: number;
  can_go_live: boolean;
  onboarding_required: boolean;
  bot_global_enabled: boolean;
  checklist: Record<
    OnboardingChecklistKey,
    { done: boolean; required: boolean }
  >;
  missing_for_go_live: string[];
  draft: OnboardingDraft;
};
