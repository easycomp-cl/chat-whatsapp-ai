import { IntegrationProvider } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { encryptionService } from "../../lib/encryption.service.js";
import { prisma } from "../../lib/prisma.js";
import { FlowHttpError } from "./flows.errors.js";

const flowWebhookIntegrationConfigSchema = z.object({
  url: z.string().url(),
  enabled: z.boolean().default(true),
  events: z.array(z.string().min(1)).optional()
});

export type FlowWebhookIntegrationConfig = z.infer<typeof flowWebhookIntegrationConfigSchema>;

export class FlowWebhookIntegrationService {
  async getIntegration(tenantId: string) {
    const integration = await prisma.tenantIntegration.findUnique({
      where: {
        tenantId_provider: {
          tenantId,
          provider: IntegrationProvider.FLOW_WEBHOOK
        }
      }
    });

    if (!integration) {
      return null;
    }

    const config = flowWebhookIntegrationConfigSchema.safeParse(integration.configJson);
    if (!config.success) {
      return null;
    }

    return {
      integration,
      config: config.data,
      hasSecret: Boolean(integration.credentialsEncrypted)
    };
  }

  async upsertIntegration(
    tenantId: string,
    input: {
      url: string;
      enabled?: boolean;
      events?: string[];
      rotate_secret?: boolean;
      webhook_secret?: string;
    }
  ) {
    const config = flowWebhookIntegrationConfigSchema.parse({
      url: input.url,
      enabled: input.enabled ?? true,
      events: input.events
    });

    const existing = await this.getIntegration(tenantId);
    let secretPlain: string | undefined;

    if (input.webhook_secret) {
      secretPlain = input.webhook_secret;
    } else if (!existing || input.rotate_secret) {
      secretPlain = randomBytes(24).toString("hex");
    }

    const integration = await prisma.tenantIntegration.upsert({
      where: {
        tenantId_provider: {
          tenantId,
          provider: IntegrationProvider.FLOW_WEBHOOK
        }
      },
      create: {
        tenantId,
        provider: IntegrationProvider.FLOW_WEBHOOK,
        credentialsEncrypted: encryptionService.encrypt(secretPlain!),
        configJson: config,
        isActive: config.enabled
      },
      update: {
        configJson: config,
        isActive: config.enabled,
        ...(secretPlain
          ? { credentialsEncrypted: encryptionService.encrypt(secretPlain) }
          : {})
      }
    });

    return {
      url: config.url,
      enabled: config.enabled,
      events: config.events ?? null,
      has_secret: Boolean(integration.credentialsEncrypted),
      ...(secretPlain ? { webhook_secret: secretPlain } : {})
    };
  }

  resolveSigningSecret(integration: { credentialsEncrypted: string | null }): string {
    if (!integration.credentialsEncrypted) {
      throw new FlowHttpError("Integración webhook sin secreto configurado", 503, "webhook_secret_missing");
    }

    return encryptionService.decrypt(integration.credentialsEncrypted);
  }

  isEventAllowed(config: FlowWebhookIntegrationConfig, eventType: string): boolean {
    if (!config.enabled) {
      return false;
    }
    if (!config.events?.length) {
      return true;
    }
    return config.events.includes(eventType);
  }
}

export const flowWebhookIntegrationService = new FlowWebhookIntegrationService();
