import type { GreetingConfig, SuggestedGreeting } from "./greeting-config.type.js";

export type ToneAnalysisAiResult = {
  tone_summary: string;
  communication_style: string;
  common_phrases: string[];
  emoji_usage: "none" | "low" | "moderate" | "high";
  response_length: "short" | "medium" | "long";
  sales_style: string;
  formality_level: "informal" | "semi_formal" | "formal";
  suggested_greetings?: SuggestedGreeting[];
  filler_words?: string[];
  recommended_bot_rules: {
    use_emojis?: boolean | string;
    response_length?: string;
    offer_next_step?: boolean;
    avoid_long_explanations?: boolean;
    suggested_greetings?: SuggestedGreeting[];
    filler_words?: string[];
    greeting_config?: GreetingConfig;
    [key: string]: unknown;
  };
  confidence: number;
};
