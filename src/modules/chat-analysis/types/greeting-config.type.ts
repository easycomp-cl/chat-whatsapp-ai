export type GreetingWarmth = "formal" | "neutral" | "warm";

export type SuggestedGreeting = {
  text: string;
  warmth: GreetingWarmth;
  source: string;
  usage_count?: number;
};

export type GreetingConfig = {
  new_customer_warmth: GreetingWarmth;
  returning_customer_warmth: GreetingWarmth;
  returning_min_messages: number;
  combine_greeting_with_answers: boolean;
};

export const DEFAULT_GREETING_CONFIG: GreetingConfig = {
  new_customer_warmth: "neutral",
  returning_customer_warmth: "warm",
  returning_min_messages: 3,
  combine_greeting_with_answers: true
};
