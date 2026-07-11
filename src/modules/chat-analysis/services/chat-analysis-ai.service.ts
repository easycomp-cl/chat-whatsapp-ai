import { openAiService } from "../../runtime/openai.service.js";
import type { FaqDetectionAiResult } from "../types/detected-faq.type.js";
import type { ToneAnalysisAiResult } from "../types/tone-analysis-result.type.js";

const TONE_ANALYSIS_PROMPT = `
Analiza los siguientes mensajes de un negocio con sus clientes.

Objetivo:
Detectar el tono, estilo y forma de responder del negocio.

Debes responder en JSON v?lido con esta estructura:

{
  "tone_summary": "",
  "communication_style": "",
  "common_phrases": [],
  "suggested_greetings": [
    { "text": "Hola", "warmth": "neutral", "source": "chat", "usage_count": 1 }
  ],
  "filler_words": ["po", "jajaja"],
  "emoji_usage": "none | low | moderate | high",
  "response_length": "short | medium | long",
  "sales_style": "",
  "formality_level": "informal | semi_formal | formal",
  "recommended_bot_rules": {
    "use_emojis": true,
    "response_length": "short | medium | long",
    "offer_next_step": true,
    "avoid_long_explanations": true,
    "greeting_config": {
      "new_customer_warmth": "neutral",
      "returning_customer_warmth": "warm",
      "returning_min_messages": 3,
      "combine_greeting_with_answers": true
    }
  },
  "confidence": 0.0
}

Reglas:
- Analiza solo los mensajes marcados como business.
- No inventes informaci?n.
- Detecta frases repetidas y muletillas informales (po, jajaja, wn, etc.).
- Detecta saludos reales que usa el negocio al iniciar conversaciones (ej: "Holaaa", "Hola! Buen dia!", "Hola").
- Clasifica cada saludo: formal, neutral o warm seg?n cercan?a y emojis.
- recommended_bot_rules.use_emojis debe ser coherente con emoji_usage.
- recommended_bot_rules.response_length debe coincidir con response_length.
- recommended_bot_rules.offer_next_step: true si suele cerrar ofreciendo agendar, precios o un siguiente paso.
- Detecta si el negocio vende, agenda, informa o deriva.
- Mant?n el resultado claro y usable para configurar un bot.
`.trim();

const FAQ_DETECTION_PROMPT = `
Analiza los siguientes mensajes de clientes y respuestas del negocio.

Objetivo:
Detectar preguntas frecuentes que se repiten y proponer respuestas basadas en c?mo responde el negocio.

Debes responder en JSON v?lido con esta estructura:

{
  "detected_faqs": [
    {
      "question": "",
      "normalized_question": "",
      "suggested_answer": "",
      "category": "",
      "evidence_count": 0,
      "confidence": 0.0
    }
  ]
}

Reglas:
- Agrupa preguntas parecidas.
- No inventes precios, horarios ni datos que no aparezcan en la conversaci?n.
- Si falta un dato importante, usa un placeholder como $____ o ____.
- La respuesta sugerida debe imitar el tono del negocio.
- Solo incluye preguntas que aparezcan m?s de una vez o que sean claramente relevantes.
- No incluyas informaci?n sensible.
`.trim();

function extractJson<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("La IA no devolvi? JSON v?lido");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}

const CONSOLIDATE_TONE_PROMPT = `
Fusiona varios an?lisis de tono del mismo negocio (distintos chats con clientes) en uno solo.

Responde JSON v?lido con la misma estructura que un an?lisis individual:
{
  "tone_summary": "",
  "communication_style": "",
  "common_phrases": [],
  "suggested_greetings": [],
  "filler_words": [],
  "emoji_usage": "none | low | moderate | high",
  "response_length": "short | medium | long",
  "sales_style": "",
  "formality_level": "informal | semi_formal | formal",
  "recommended_bot_rules": {
    "use_emojis": true,
    "response_length": "short | medium | long",
    "offer_next_step": true,
    "avoid_long_explanations": true,
    "greeting_config": {
      "new_customer_warmth": "neutral",
      "returning_customer_warmth": "warm",
      "returning_min_messages": 3,
      "combine_greeting_with_answers": true
    }
  },
  "confidence": 0.0
}

Reglas:
- Unifica el estilo sin contradecir patrones claros.
- Combina frases comunes y saludos sin duplicar.
- Fusiona muletillas detectadas.
- Sincroniza recommended_bot_rules con emoji_usage, response_length y sales_style.
- No inventes datos nuevos.
`.trim();

export class ChatAnalysisAiService {
  async consolidateTone(
    analyses: Array<{ tone_summary: string; common_phrases: string[] }>,
    model?: string
  ): Promise<ToneAnalysisAiResult> {
    const payload = analyses
      .map((a, i) => `Chat ${i + 1}:\nResumen: ${a.tone_summary}\nFrases: ${a.common_phrases.join(", ")}`)
      .join("\n\n");
    const result = await openAiService.respond({
      systemPrompt: CONSOLIDATE_TONE_PROMPT,
      userMessage: payload,
      ...(model ? { model } : {})
    });
    return extractJson<ToneAnalysisAiResult>(result.text);
  }

  async analyzeTone(businessMessages: string[], model?: string): Promise<ToneAnalysisAiResult> {
    const sample = businessMessages.slice(0, 200).join("\n---\n");
    const result = await openAiService.respond({
      systemPrompt: TONE_ANALYSIS_PROMPT,
      userMessage: sample,
      ...(model ? { model } : {})
    });
    return extractJson<ToneAnalysisAiResult>(result.text);
  }

  async detectFaqs(
    conversationSample: string,
    model?: string
  ): Promise<FaqDetectionAiResult> {
    return this.detectFaqsFromSamples([conversationSample], model);
  }

  async detectFaqsFromSamples(
    conversationSamples: string[],
    model?: string
  ): Promise<FaqDetectionAiResult> {
    const merged = new Map<string, FaqDetectionAiResult["detected_faqs"][number]>();

    for (let index = 0; index < conversationSamples.length; index++) {
      const sample = conversationSamples[index] ?? "";
      if (!sample.trim()) continue;

      const userMessage =
        conversationSamples.length > 1
          ? `Fragmento ${index + 1} de ${conversationSamples.length} del chat:\n\n${sample}`
          : sample;

      const result = await openAiService.respond({
        systemPrompt: FAQ_DETECTION_PROMPT,
        userMessage,
        ...(model ? { model } : {})
      });
      const parsed = extractJson<FaqDetectionAiResult>(result.text);
      for (const faq of parsed.detected_faqs ?? []) {
        const key = (faq.normalized_question || faq.question).trim().toLowerCase();
        const existing = merged.get(key);
        if (!existing || faq.evidence_count > existing.evidence_count) {
          merged.set(key, faq);
        }
      }
    }

    return { detected_faqs: [...merged.values()] };
  }
}

export const chatAnalysisAiService = new ChatAnalysisAiService();
