import { decisionEngine } from "../decision/decision.engine.js";
import { faqEngine } from "../faq/faq.engine.js";
import { ragService } from "../rag/rag.service.js";
import { openAiService } from "./openai.service.js";
import { handoffService } from "./handoff.service.js";
import { MessageIngestService } from "../conversations/message-ingest.service.js";
import { usageEventsService, USAGE_EVENT_TYPES } from "../metrics/usage-events.service.js";
import { parseTenantKnowledgeConfig } from "../tenants/tenant-knowledge-config.js";
import {
  buildRuntimeSystemPrompt,
  detectHandoffReason,
  parseToneCommonPhrases
} from "./prompts.js";
import type { HandoffReason } from "./prompts.js";
import {
  buildConversationalReply,
  detectConversationalIntent,
  isGreetingLike,
  isGreetingWithBusinessQuestion
} from "../../utils/conversational.js";
import { shouldBypassFaqMatch } from "../../utils/faq-bypass.js";
import {
  buildGreetingStyleHint,
  parseToneGreetingConfig,
  parseToneGreetings,
  pickGreetingForWarmth
} from "./greeting-runtime.service.js";
import {
  isReturningCustomerForMessage,
  resolveCustomerWarmthForMessage
} from "../customers/customer-returning.service.js";
import { resolveCustomerDisplayName } from "../../utils/customer-display-name.js";
import {
  parseConversationalConfig,
  pickConversationalResponse
} from "./conversational-response.service.js";

export type PipelineInput = {
  tenant: {
    id: string;
    name: string;
    botGlobalEnabled: boolean;
    defaultAiModel: string;
    confidenceThreshold: number;
    config: {
      botName: string;
      botTone: string;
      greetingMessage: string;
      handoffMessage: string;
      fallbackMessage?: string;
      configJson?: unknown;
    } | null;
  };
  conversation: {
    id: string;
    mode: "BOT" | "HUMAN";
    botResumeAt: Date | null;
    channelPhoneNumber: string;
  };
  customer: {
    id: string;
    phoneNumber: string;
    name?: string | null;
    displayAlias?: string | null;
  };
  incomingText: string;
  channel: {
    phoneNumberId: string;
    accessToken: string;
  };
};

export type PipelineResult = {
  reply?: string;
  outboundMessageId?: string;
  mode: "bot" | "human";
  skipped?: boolean;
};

export class ResponsePipelineService {
  constructor(private readonly messageIngestService = new MessageIngestService()) {}

  async process(input: PipelineInput): Promise<PipelineResult> {
    if (!input.tenant.config) {
      return { reply: "Este negocio todavía no está configurado. Te responderemos pronto.", mode: "bot" };
    }

    const decision = await decisionEngine.evaluate({
      tenantId: input.tenant.id,
      botGlobalEnabled: input.tenant.botGlobalEnabled,
      conversationId: input.conversation.id,
      mode: input.conversation.mode,
      botResumeAt: input.conversation.botResumeAt
    });

    if (!decision.canRespond) {
      return { mode: decision.reason === "human_mode" ? "human" : "bot", skipped: true };
    }

    const preHandoff = detectHandoffReason(input.incomingText);
    if (preHandoff) {
      const result = await handoffService.execute({
        tenantId: input.tenant.id,
        tenantName: input.tenant.name,
        conversationId: input.conversation.id,
        customerPhone: input.customer.phoneNumber,
        customerName: resolveCustomerDisplayName(input.customer),
        messageText: input.incomingText,
        handoffReason: preHandoff,
        handoffMessage: input.tenant.config.handoffMessage,
        channelPhoneNumberId: input.channel.phoneNumberId,
        accessToken: input.channel.accessToken
      });
      const outboundMessageId = await this.persistBotReply(input, result.reply, false);
      return { reply: result.reply, outboundMessageId, mode: "human" };
    }

    const configJson =
      input.tenant.config.configJson &&
      typeof input.tenant.config.configJson === "object" &&
      !Array.isArray(input.tenant.config.configJson)
        ? (input.tenant.config.configJson as Record<string, unknown>)
        : {};
    const toneGreetings = parseToneGreetings(configJson);
    const greetingConfig = parseToneGreetingConfig(configJson);
    const conversationalConfig = parseConversationalConfig(configJson);
    const customerWarmth = await resolveCustomerWarmthForMessage({
      customerId: input.customer.id,
      tenantId: input.tenant.id,
      tenantConfigJson: configJson
    });
    const toneGreeting = pickGreetingForWarmth(
      toneGreetings,
      customerWarmth,
      input.tenant.config.greetingMessage
    );
    const hybridGreetingMessage = isGreetingWithBusinessQuestion(input.incomingText);
    const isReturningCustomer = await isReturningCustomerForMessage({
      customerId: input.customer.id,
      tenantId: input.tenant.id,
      tenantConfigJson: configJson
    });

    const conversationalContext = {
      greetingMessage: input.tenant.config.greetingMessage,
      botName: input.tenant.config.botName,
      businessName: input.tenant.name,
      toneGreeting,
      customerName: resolveCustomerDisplayName(input.customer),
      isReturningCustomer,
      conversationId: input.conversation.id,
      conversationalConfig,
      warmth: customerWarmth,
      ...(input.tenant.config.fallbackMessage
        ? { fallbackMessage: input.tenant.config.fallbackMessage }
        : {})
    };

    const conversationalIntent = hybridGreetingMessage
      ? null
      : detectConversationalIntent(input.incomingText);
    if (conversationalIntent) {
      const reply = buildConversationalReply(conversationalIntent, conversationalContext);
      const outboundMessageId = await this.persistBotReply(input, reply, false);
      return { reply, outboundMessageId, mode: "bot" };
    }

    const faqMatch = await faqEngine.findMatch(input.tenant.id, input.incomingText);
    if (
      faqMatch &&
      !shouldBypassFaqMatch(input.incomingText, faqMatch.question, faqMatch.answer)
    ) {
      const faqReply =
        hybridGreetingMessage && greetingConfig.combine_greeting_with_answers
          ? `${toneGreeting} ${faqMatch.answer}`
          : faqMatch.answer;
      const outboundMessageId = await this.persistBotReply(input, faqReply, false);
      await usageEventsService.track({
        tenantId: input.tenant.id,
        conversationId: input.conversation.id,
        eventType: USAGE_EVENT_TYPES.FAQ_RESPONSE_SENT,
        metadata: { faqId: faqMatch.id, matchType: faqMatch.matchType, score: faqMatch.score }
      });
      return { reply: faqReply, outboundMessageId, mode: "bot" };
    }

    const knowledgeConfig = parseTenantKnowledgeConfig(input.tenant.config?.configJson);
    const ragHits = await ragService.retrieve(input.tenant.id, input.incomingText);
    const bestScore = ragService.getBestScore(ragHits);
    const confidenceThreshold =
      knowledgeConfig.minConfidence ?? input.tenant.confidenceThreshold;
    const lowConfidence = bestScore < confidenceThreshold;
    const greetingLike = isGreetingLike(input.incomingText);

    if (lowConfidence && greetingLike && !hybridGreetingMessage) {
      const reply = buildConversationalReply("greeting", conversationalContext);
      const outboundMessageId = await this.persistBotReply(input, reply, false);
      return { reply, outboundMessageId, mode: "bot" };
    }

    if (lowConfidence && !hybridGreetingMessage) {
      if (!conversationalConfig.handoff_on_low_confidence) {
        const softReply = pickConversationalResponse({
          trigger: "soft_fallback",
          config: conversationalConfig,
          warmth: customerWarmth,
          conversationId: input.conversation.id,
          placeholders: {
            negocio: input.tenant.name,
            bot: input.tenant.config.botName,
            saludo: toneGreeting,
            ...(resolveCustomerDisplayName(input.customer)
              ? { nombre: resolveCustomerDisplayName(input.customer) }
              : {})
          },
          ...(input.tenant.config.fallbackMessage
            ? { fallbackMessage: input.tenant.config.fallbackMessage }
            : {})
        });
        if (softReply) {
          const outboundMessageId = await this.persistBotReply(input, softReply, false);
          return { reply: softReply, outboundMessageId, mode: "bot" };
        }
      }

      const result = await handoffService.execute({
        tenantId: input.tenant.id,
        tenantName: input.tenant.name,
        conversationId: input.conversation.id,
        customerPhone: input.customer.phoneNumber,
        customerName: resolveCustomerDisplayName(input.customer),
        messageText: input.incomingText,
        handoffReason: "low_rag_confidence" satisfies HandoffReason,
        handoffMessage: input.tenant.config.handoffMessage,
        channelPhoneNumberId: input.channel.phoneNumberId,
        accessToken: input.channel.accessToken
      });
      const outboundMessageId = await this.persistBotReply(input, result.reply, false);
      return { reply: result.reply, outboundMessageId, mode: "human" };
    }

    const knowledge = lowConfidence ? "" : ragService.formatContext(ragHits);
    const greetingStyleHint =
      toneGreetings.length > 0 || hybridGreetingMessage
        ? buildGreetingStyleHint({
            greeting: toneGreeting,
            combineWithAnswers: greetingConfig.combine_greeting_with_answers,
            isHybridMessage: hybridGreetingMessage
          })
        : undefined;
    const runtimePromptInput: Parameters<typeof buildRuntimeSystemPrompt>[0] = {
      businessName: input.tenant.name,
      botName: input.tenant.config.botName,
      botTone: input.tenant.config.botTone,
      knowledge,
      commonPhrases: parseToneCommonPhrases(configJson),
      ...(greetingStyleHint ? { greetingStyleHint } : {})
    };
    if (configJson.toneRules && typeof configJson.toneRules === "object") {
      runtimePromptInput.toneRules = configJson.toneRules as Record<string, unknown>;
    }
    const aiResult = await openAiService.respond({
      systemPrompt: buildRuntimeSystemPrompt(runtimePromptInput),
      userMessage: input.incomingText,
      model: input.tenant.defaultAiModel
    });

    if (openAiService.shouldHandoff(aiResult.text)) {
      if (hybridGreetingMessage || greetingLike) {
        const softReply = pickConversationalResponse({
          trigger: "soft_fallback",
          config: conversationalConfig,
          warmth: customerWarmth,
          conversationId: input.conversation.id,
          placeholders: {
            negocio: input.tenant.name,
            bot: input.tenant.config.botName,
            saludo: toneGreeting,
            ...(resolveCustomerDisplayName(input.customer)
              ? { nombre: resolveCustomerDisplayName(input.customer) }
              : {})
          },
          ...(input.tenant.config.fallbackMessage
            ? { fallbackMessage: input.tenant.config.fallbackMessage }
            : {})
        });
        if (softReply) {
          const outboundMessageId = await this.persistBotReply(input, softReply, false);
          return { reply: softReply, outboundMessageId, mode: "bot" };
        }
      }

      const result = await handoffService.execute({
        tenantId: input.tenant.id,
        tenantName: input.tenant.name,
        conversationId: input.conversation.id,
        customerPhone: input.customer.phoneNumber,
        customerName: resolveCustomerDisplayName(input.customer),
        messageText: input.incomingText,
        handoffReason: "ai_uncertain",
        handoffMessage: input.tenant.config.handoffMessage,
        channelPhoneNumberId: input.channel.phoneNumberId,
        accessToken: input.channel.accessToken
      });
      const outboundMessageId = await this.persistBotReply(input, result.reply, false);
      return { reply: result.reply, outboundMessageId, mode: "human" };
    }

    const outboundMessageId = await this.persistBotReply(input, aiResult.text, true);
    await usageEventsService.track({
      tenantId: input.tenant.id,
      conversationId: input.conversation.id,
      eventType: USAGE_EVENT_TYPES.RAG_RESPONSE_SENT,
      metadata: { ragScore: bestScore, chunksUsed: ragHits.length }
    });
    await usageEventsService.track({
      tenantId: input.tenant.id,
      conversationId: input.conversation.id,
      eventType: USAGE_EVENT_TYPES.AI_RESPONSE_SENT,
      tokensInput: aiResult.tokensInput,
      tokensOutput: aiResult.tokensOutput,
      estimatedCost: aiResult.estimatedCost
    });

    return { reply: aiResult.text, outboundMessageId, mode: "bot" };
  }

  private async persistBotReply(input: PipelineInput, text: string, aiGenerated: boolean) {
    const message = await this.messageIngestService.ingestBotMessage({
      tenantId: input.tenant.id,
      conversationId: input.conversation.id,
      customerId: input.customer.id,
      botPhone: input.conversation.channelPhoneNumber,
      customerPhone: input.customer.phoneNumber,
      text,
      aiGenerated
    });
    return message.id;
  }
}

export const responsePipelineService = new ResponsePipelineService();
