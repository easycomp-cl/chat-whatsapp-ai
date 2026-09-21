import type { Prisma } from "@prisma/client";
import type { OnboardingDraft, OnboardingSetupMetadata } from "./onboarding.types.js";

type DraftDb = {
  tenant: {
    update: (args: Prisma.TenantUpdateArgs) => Promise<unknown>;
  };
};

export async function persistOnboardingDraftState(
  db: DraftDb,
  input: {
    tenantId: string;
    metadataJson: Prisma.JsonValue | null;
    setup: OnboardingSetupMetadata;
    draft: OnboardingDraft;
    currentStep: number;
    draftUpdatedAt?: Date;
    logoUrl?: string | null;
    completedAt?: Date | null;
  }
) {
  const draftUpdatedAt = input.draftUpdatedAt ?? new Date();
  const nextSetup: OnboardingSetupMetadata = {
    ...input.setup,
    draft: input.draft,
    current_step: input.currentStep,
    draft_updated_at: draftUpdatedAt.toISOString()
  };

  const record =
    input.metadataJson && typeof input.metadataJson === "object" && !Array.isArray(input.metadataJson)
      ? { ...(input.metadataJson as Record<string, unknown>) }
      : {};
  record.setup = nextSetup;

  const data: Prisma.TenantUpdateInput = {
    metadataJson: record as Prisma.InputJsonValue,
    onboardingDraft: {
      upsert: {
        create: {
          currentStep: input.currentStep,
          draftJson: input.draft as Prisma.InputJsonValue,
          draftUpdatedAt
        },
        update: {
          currentStep: input.currentStep,
          draftJson: input.draft as Prisma.InputJsonValue,
          draftUpdatedAt
        }
      }
    }
  };

  if (input.logoUrl !== undefined) {
    data.logoUrl = input.logoUrl;
  }
  if (input.completedAt !== undefined) {
    data.onboardingCompletedAt = input.completedAt;
  }

  await db.tenant.update({
    where: { id: input.tenantId },
    data
  });

  return { draftUpdatedAt, setup: nextSetup };
}
