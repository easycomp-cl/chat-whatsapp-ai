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
  HANDOFF_REASON_LABELS,
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
import { escalationDetectorService } from "./escalation-detector.service.js";
import { getRecentBotMessageTexts } from "./conversation-escalation-state.js";
import { resolveHandoffCustomerMessage } from "./handoff-message.resolver.js";
import { isBotRuntimeBlocked } from "../onboarding/onboarding-config.js";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import {
  buildRetrievalQuery,
  getConversationHistory,
  isAnaphoricFollowUp
} from "./conversation-history.js";
import { formatCustomerMemory } from "./customer-memory.js";
import { productQuoteService } from "../quotes/product-quote.service.js";
import {
  isMechanicAgentEnabled,
  looksLikeVehicleQuery,
  mechanicAgentService
} from "../vehicles/mechanic-agent.service.js";
import { systemEventService } from "../conversations/system-event.service.js";
import { buildSystemEvent } from "../conversations/system-event-copy.js";
import {
  buildQualificationState,
  hasVehicleIdentity,
  resolveKnownPersonName
} from "./qualification.js";
import { readCustomerGarage } from "../customers/customer-garage.js";

const BOT_SETUP_MESSAGE =
  "Hola. Estamos configurando nuestro asistente. Te responderemos muy pronto.";

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
      outOfHoursMessage?: string;
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

    if (isBotRuntimeBlocked(input.tenant.botGlobalEnabled)) {
      const reply =
        input.tenant.config.outOfHoursMessage?.trim() || BOT_SETUP_MESSAGE;
      const outboundMessageId = await this.persistBotReply(input, reply, false);
      return { reply, outboundMessageId, mode: "bot" };
    }

    const decision = await decisionEngine.evaluate({
      tenantId: input.tenant.id,
      botGlobalEnabled: input.tenant.botGlobalEnabled,
      conversationId: input.conversation.id,
      mode: input.conversation.mode,
      botResumeAt: input.conversation.botResumeAt
    });

    if (!decision.canRespond) {
      logger.info(
        { conversationId: input.conversation.id, reason: decision.reason },
        "Bot skipped inbound message"
      );
      return { mode: decision.reason === "human_mode" ? "human" : "bot", skipped: true };
    }

    const recentBotMessages = await getRecentBotMessageTexts(input.conversation.id);
    const fallbackMessage = input.tenant.config.fallbackMessage;

    const preEscalation = escalationDetectorService.evaluatePreResponse({
      incomingText: input.incomingText,
      recentBotMessages,
      ...(fallbackMessage ? { fallbackMessage } : {})
    });

    if (preEscalation.action === "handoff") {
      return this.executeHandoff(input, preEscalation.reason);
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

    const knownPersonName = resolveKnownPersonName({
      displayAlias: input.customer.displayAlias,
      name: input.customer.name
    });

    const conversationalContext = {
      greetingMessage: input.tenant.config.greetingMessage,
      botName: input.tenant.config.botName,
      businessName: input.tenant.name,
      toneGreeting,
      ...(knownPersonName ? { customerName: knownPersonName } : {}),
      isReturningCustomer,
      conversationId: input.conversation.id,
      conversationalConfig,
      warmth: customerWarmth,
      ...(fallbackMessage ? { fallbackMessage } : {})
    };

    const conversationalIntent = hybridGreetingMessage
      ? null
      : detectConversationalIntent(input.incomingText);
    if (conversationalIntent) {
      const reply = buildConversationalReply(conversationalIntent, conversationalContext);
      const outboundMessageId = await this.persistBotReply(input, reply, false);
      return { reply, outboundMessageId, mode: "bot" };
    }

    try {
      const quoteSend = await productQuoteService.trySendFromConversationText({
        conversationId: input.conversation.id,
        incomingText: input.incomingText
      });
      if (quoteSend.sent) {
        await systemEventService.appendSafe({
          tenantId: input.tenant.id,
          conversationId: input.conversation.id,
          customerId: input.customer.id,
          customerPhone: input.customer.phoneNumber,
          event: buildSystemEvent(
            "quote_prepared",
            "BOT",
            "Cotización PDF armada según el catálogo y enviada por WhatsApp.",
            { message_id: quoteSend.messageId ?? null }
          )
        });
        return {
          mode: "bot",
          ...(quoteSend.messageId ? { outboundMessageId: quoteSend.messageId } : {})
        };
      }
    } catch (error) {
      logger.warn(
        { err: error, conversationId: input.conversation.id },
        "Product quote auto-send skipped"
      );
    }

    const knowledgeConfig = parseTenantKnowledgeConfig(input.tenant.config?.configJson);
    const [history, customerRow] = await Promise.all([
      getConversationHistory({
        conversationId: input.conversation.id,
        incomingText: input.incomingText
      }),
      prisma.customer.findUnique({
        where: { id: input.customer.id },
        select: {
          name: true,
          displayAlias: true,
          email: true,
          taxId: true,
          invoiceType: true,
          companyName: true,
          delivery1Line1: true,
          delivery1Commune: true,
          delivery1Region: true,
          delivery1Notes: true,
          profileMetadata: true
        }
      })
    ]);

    const mechanicEnabled = isMechanicAgentEnabled(configJson);
    const garageSnapshot = readCustomerGarage(customerRow?.profileMetadata);
    const vehicleMissingForParts =
      mechanicEnabled &&
      looksLikeVehicleQuery(input.incomingText) &&
      !hasVehicleIdentity({
        garage: garageSnapshot,
        incomingText: input.incomingText
      });

    const faqMatch = await faqEngine.findMatch(input.tenant.id, input.incomingText);
    if (
      faqMatch &&
      !vehicleMissingForParts &&
      !shouldBypassFaqMatch(input.incomingText, faqMatch.question, faqMatch.answer) &&
      !isAnaphoricFollowUp(input.incomingText)
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

    const ragQuery = buildRetrievalQuery(input.incomingText, history);
    const ragHits = await ragService.retrieve(input.tenant.id, ragQuery);
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
      const lowConfidenceEscalation = escalationDetectorService.evaluateLowConfidence({
        incomingText: input.incomingText,
        ragScore: bestScore,
        confidenceThreshold,
        handoffOnLowConfidence: conversationalConfig.handoff_on_low_confidence,
        recentBotMessages,
        hybridGreetingMessage,
        greetingLike,
        ...(fallbackMessage ? { fallbackMessage } : {})
      });

      if (lowConfidenceEscalation.action === "handoff") {
        return this.executeHandoff(input, lowConfidenceEscalation.reason);
      }

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
        ...(fallbackMessage ? { fallbackMessage } : {})
      });
      if (softReply) {
        const outboundMessageId = await this.persistBotReply(input, softReply, false);
        return { reply: softReply, outboundMessageId, mode: "bot" };
      }

      return this.executeHandoff(input, "low_rag_confidence");
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
    const customerMemory = formatCustomerMemory(customerRow);
    const mechanic = await mechanicAgentService.buildContext({
      tenantId: input.tenant.id,
      conversationId: input.conversation.id,
      customerId: input.customer.id,
      customerPhone: input.customer.phoneNumber,
      text: input.incomingText,
      configJson,
      emitEvents: true,
      actor: "BOT"
    });
    const fitmentReady = Boolean(mechanic.fitment && mechanic.fitment.compatible.length > 0);
    const qualification = buildQualificationState({
      displayAlias: customerRow?.displayAlias ?? input.customer.displayAlias,
      whatsappName: customerRow?.name ?? input.customer.name,
      profileMetadata: customerRow?.profileMetadata,
      incomingText: input.incomingText,
      mechanicEnabled,
      fitmentReady
    });
    const blockPartsCatalog =
      qualification.mechanicMode && !qualification.vehicleIdentified && !fitmentReady;
    const runtimePromptInput: Parameters<typeof buildRuntimeSystemPrompt>[0] = {
      businessName: input.tenant.name,
      botName: input.tenant.config.botName,
      botTone: input.tenant.config.botTone,
      knowledge: blockPartsCatalog ? "" : knowledge,
      commonPhrases: parseToneCommonPhrases(configJson),
      qualificationBlock: qualification.promptBlock,
      blockPartsCatalogUntilVehicle: blockPartsCatalog,
      ...(greetingStyleHint ? { greetingStyleHint } : {}),
      ...(customerMemory ? { customerMemory } : {}),
      ...(mechanic.context ? { vehicleContext: mechanic.context } : {})
    };
    if (configJson.toneRules && typeof configJson.toneRules === "object") {
      runtimePromptInput.toneRules = configJson.toneRules as Record<string, unknown>;
    }
    let aiResult: Awaited<ReturnType<typeof openAiService.respond>>;
    try {
      aiResult = await openAiService.respond({
        systemPrompt: buildRuntimeSystemPrompt(runtimePromptInput),
        userMessage: input.incomingText,
        model: input.tenant.defaultAiModel,
        history
      });
    } catch (error) {
      logger.error(
        { err: error, conversationId: input.conversation.id, model: input.tenant.defaultAiModel },
        "OpenAI failed in response pipeline"
      );
      return this.replyWithSoftFallbackOrHandoff(
        input,
        conversationalConfig,
        customerWarmth,
        toneGreeting,
        fallbackMessage
      );
    }

    if (!aiResult.text.trim()) {
      logger.warn(
        { conversationId: input.conversation.id, model: aiResult.model },
        "OpenAI returned empty reply"
      );
      return this.replyWithSoftFallbackOrHandoff(
        input,
        conversationalConfig,
        customerWarmth,
        toneGreeting,
        fallbackMessage
      );
    }

    if (openAiService.shouldHandoff(aiResult.text)) {
      const aiEscalation = escalationDetectorService.evaluateAiUncertainty({
        hybridGreetingMessage,
        greetingLike,
        recentBotMessages,
        ...(fallbackMessage ? { fallbackMessage } : {})
      });

      if (aiEscalation.action === "handoff") {
        return this.executeHandoff(input, aiEscalation.reason);
      }

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
        ...(fallbackMessage ? { fallbackMessage } : {})
      });
      if (softReply) {
        const outboundMessageId = await this.persistBotReply(input, softReply, false);
        return { reply: softReply, outboundMessageId, mode: "bot" };
      }

      return this.executeHandoff(input, "ai_uncertain");
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
      estimatedCost: aiResult.estimatedCost,
      metadata: { model: aiResult.model, latencyMs: aiResult.latencyMs }
    });

    return { reply: aiResult.text, outboundMessageId, mode: "bot" };
  }

  private async replyWithSoftFallbackOrHandoff(
    input: PipelineInput,
    conversationalConfig: ReturnType<typeof parseConversationalConfig>,
    customerWarmth: Awaited<ReturnType<typeof resolveCustomerWarmthForMessage>>,
    toneGreeting: string,
    fallbackMessage?: string
  ): Promise<PipelineResult> {
    const softReply = pickConversationalResponse({
      trigger: "soft_fallback",
      config: conversationalConfig,
      warmth: customerWarmth,
      conversationId: input.conversation.id,
      placeholders: {
        negocio: input.tenant.name,
        bot: input.tenant.config!.botName,
        saludo: toneGreeting,
        ...(resolveCustomerDisplayName(input.customer)
          ? { nombre: resolveCustomerDisplayName(input.customer) }
          : {})
      },
      ...(fallbackMessage ? { fallbackMessage } : {})
    });
    if (softReply) {
      const outboundMessageId = await this.persistBotReply(input, softReply, false);
      return { reply: softReply, outboundMessageId, mode: "bot" };
    }
    return this.executeHandoff(input, "ai_uncertain");
  }

  private async executeHandoff(
    input: PipelineInput,
    handoffReason: HandoffReason
  ): Promise<PipelineResult> {
    const handoffMessage = resolveHandoffCustomerMessage({
      reason: handoffReason,
      businessName: input.tenant.name,
      defaultHandoffMessage: input.tenant.config!.handoffMessage
    });

    const result = await handoffService.execute({
      tenantId: input.tenant.id,
      tenantName: input.tenant.name,
      conversationId: input.conversation.id,
      customerPhone: input.customer.phoneNumber,
      customerName: resolveCustomerDisplayName(input.customer),
      messageText: input.incomingText,
      handoffReason,
      handoffMessage,
      channelPhoneNumberId: input.channel.phoneNumberId,
      accessToken: input.channel.accessToken
    });
    const outboundMessageId = await this.persistBotReply(input, result.reply, false);
    await systemEventService.appendSafe({
      tenantId: input.tenant.id,
      conversationId: input.conversation.id,
      customerId: input.customer.id,
      customerPhone: input.customer.phoneNumber,
      event: buildSystemEvent("handoff", "BOT", HANDOFF_REASON_LABELS[handoffReason], {
        reason: handoffReason
      })
    });
    return { reply: result.reply, outboundMessageId, mode: "human" };
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
