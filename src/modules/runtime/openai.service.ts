import OpenAI from "openai";
import { env } from "../../config/env.js";
import { estimateAiCostUsd, isReasoningModel } from "./ai-model-pricing.js";
import type { ChatTurn } from "./conversation-history.js";

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export type AiResponseResult = {
  text: string;
  tokensInput: number;
  tokensOutput: number;
  estimatedCost: number;
  latencyMs: number;
  model: string;
};

export class OpenAIService {
  async respond(input: {
    systemPrompt: string;
    userMessage: string;
    model?: string;
    history?: ChatTurn[];
  }): Promise<AiResponseResult> {
    const model = input.model ?? env.OPENAI_MODEL;
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: input.systemPrompt },
      ...(input.history ?? []).map((turn) => ({
        role: turn.role,
        content: turn.content
      })),
      { role: "user", content: input.userMessage }
    ];

    const startedAt = Date.now();
    const response = await this.createCompletion(model, messages);
    const latencyMs = Date.now() - startedAt;

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    const tokensInput = response.usage?.prompt_tokens ?? 0;
    const tokensOutput = response.usage?.completion_tokens ?? 0;
    const estimatedCost = estimateAiCostUsd({ model, tokensInput, tokensOutput });

    return { text, tokensInput, tokensOutput, estimatedCost, latencyMs, model };
  }

  private async createCompletion(
    model: string,
    messages: OpenAI.Chat.ChatCompletionMessageParam[]
  ) {
    const reasoning = isReasoningModel(model);
    const payload = {
      model,
      messages,
      ...(reasoning ? { reasoning_effort: "none" as const } : { temperature: 0.2 })
    };

    try {
      return await client.chat.completions.create(
        payload as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming
      );
    } catch (error) {
      if (!reasoning) throw error;
      return await client.chat.completions.create({
        model,
        messages
      });
    }
  }

  shouldHandoff(reply: string): boolean {
    const normalized = reply.toLowerCase();
    return (
      normalized.includes("derivar") ||
      normalized.includes("asesor") ||
      normalized.includes("no tengo esa información") ||
      normalized.includes("no tengo suficiente")
    );
  }
}

export const openAiService = new OpenAIService();
