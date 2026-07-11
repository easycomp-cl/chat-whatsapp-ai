import OpenAI from "openai";
import { env } from "../../config/env.js";

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export type AiResponseResult = {
  text: string;
  tokensInput: number;
  tokensOutput: number;
  estimatedCost: number;
};

const COST_PER_1M_INPUT = 0.15;
const COST_PER_1M_OUTPUT = 0.6;

export class OpenAIService {
  async respond(input: {
    systemPrompt: string;
    userMessage: string;
    model?: string;
  }): Promise<AiResponseResult> {
    const model = input.model ?? env.OPENAI_MODEL;

    const response = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userMessage }
      ]
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    const tokensInput = response.usage?.prompt_tokens ?? 0;
    const tokensOutput = response.usage?.completion_tokens ?? 0;
    const estimatedCost =
      (tokensInput / 1_000_000) * COST_PER_1M_INPUT +
      (tokensOutput / 1_000_000) * COST_PER_1M_OUTPUT;

    return { text, tokensInput, tokensOutput, estimatedCost };
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
