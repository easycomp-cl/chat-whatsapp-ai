import { INTENT_HINTS } from "./prompts.js";

const IMPLICIT_FRUSTRATION_PHRASES = [
  "como no",
  "cómo no",
  "no puede ser",
  "en serio",
  "que horror",
  "qué horror",
  "increible",
  "increíble",
  "no entiendo",
  "no me ayudan"
];

export type FrustrationSignals = {
  score: number;
  shouldEscalate: boolean;
};

function uppercaseRatio(text: string): number {
  const letters = text.replace(/[^a-záéíóúñüA-ZÁÉÍÓÚÑÜ]/g, "");
  if (letters.length < 8) return 0;
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, "").length;
  return upper / letters.length;
}

export function detectFrustrationSignals(
  text: string,
  options?: { previousBotWasSoftFallback?: boolean }
): FrustrationSignals {
  let score = 0;
  const normalized = text.toLowerCase();

  if (/!{2,}/.test(text) || /\?{3,}/.test(text)) {
    score += 0.2;
  }

  if (uppercaseRatio(text) > 0.5) {
    score += 0.25;
  }

  if (INTENT_HINTS.complaint.some((hint) => normalized.includes(hint))) {
    score += 0.5;
  }

  if (IMPLICIT_FRUSTRATION_PHRASES.some((phrase) => normalized.includes(phrase))) {
    score += 0.2;
  }

  if (options?.previousBotWasSoftFallback) {
    score += 0.3;
  }

  return {
    score,
    shouldEscalate: score >= 0.5
  };
}
