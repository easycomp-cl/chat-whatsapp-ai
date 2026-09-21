import type { OnboardingDraft, OnboardingOffering } from "./onboarding.types.js";
import {
  ONBOARDING_PROFILE_DOCUMENT_TITLE,
  ONBOARDING_SEED_FAQ_CATEGORY
} from "./onboarding.types.js";

function formatBusinessType(type?: string): string {
  switch (type) {
    case "products":
      return "Productos";
    case "services":
      return "Servicios";
    case "both":
      return "Productos y servicios";
    default:
      return "General";
  }
}

function formatOfferingLine(offering: OnboardingOffering): string {
  const priceLine =
    offering.price !== undefined && offering.price !== null
      ? ` — ${offering.price} ${offering.currency ?? "CLP"}`
      : "";
  return `- ${offering.name ?? "Ítem"}: ${offering.description ?? ""}${priceLine}`;
}

export function buildBusinessProfileDocument(input: {
  businessName: string;
  draft: OnboardingDraft;
}): string {
  const { identity, offerings = [], operations } = input.draft;
  const lines = [
    `# Perfil del negocio — ${input.businessName}`,
    "",
    "## Qué somos",
    identity?.description?.trim() || "Sin descripción.",
    "",
    "## Tipo de negocio",
    formatBusinessType(identity?.business_type),
    "",
    "## Qué ofrecemos"
  ];

  if (offerings.length) {
    lines.push(...offerings.map(formatOfferingLine));
  } else {
    lines.push("- Sin ítems detallados todavía.");
  }

  lines.push(
    "",
    "## Horario de atención",
    operations?.schedule?.trim() || "Consultar con el negocio.",
    "",
    "## Ubicación y cobertura",
    `Ciudad: ${operations?.city?.trim() || "No indicada"}`,
    `Comuna: ${operations?.commune?.trim() || "No indicada"}`,
    `Dirección: ${operations?.address?.trim() || "No indicada"}`,
    operations?.delivery_notes?.trim() ? operations.delivery_notes.trim() : "",
    "",
    "## Medios de pago",
    operations?.payment_methods?.length
      ? operations.payment_methods.join(", ")
      : "Consultar con el negocio.",
    "",
    "## Atención humana",
    "Si el cliente pide hablar con una persona, un asesor del negocio lo atenderá."
  );

  return lines.filter((line) => line !== "").join("\n");
}

export type SeedFaqDefinition = {
  question: string;
  answer: string;
  alternatePhrases: string[];
  keywords: string[];
  category: string;
};

export function buildSeedFaqs(input: {
  businessName: string;
  draft: OnboardingDraft;
}): SeedFaqDefinition[] {
  const { identity, offerings = [], operations } = input.draft;
  const offeringList = offerings.length
    ? offerings.map((o) => `• ${o.name ?? "Ítem"}: ${o.description ?? ""}`).join("\n")
    : identity?.description?.trim() || "Consulta con el negocio.";

  const locationParts = [operations?.address, operations?.commune, operations?.city]
    .filter(Boolean)
    .join(", ");

  const faqs: SeedFaqDefinition[] = [
    {
      question: "¿Qué venden o qué servicios ofrecen?",
      answer: `${identity?.description?.trim() || `Somos ${input.businessName}.`}\n\n${offeringList}`,
      alternatePhrases: [
        "qué venden",
        "qué ofrecen",
        "a qué se dedican",
        "qué productos tienen",
        "que venden"
      ],
      keywords: ["venden", "ofrecen", "productos", "servicios"],
      category: ONBOARDING_SEED_FAQ_CATEGORY
    },
    {
      question: "¿Cuál es su horario de atención?",
      answer: operations?.schedule?.trim() || "Consulta horario con el negocio.",
      alternatePhrases: ["horario", "a qué hora abren", "hasta qué hora atienden"],
      keywords: ["horario", "atienden", "abren"],
      category: ONBOARDING_SEED_FAQ_CATEGORY
    },
    {
      question: "¿Dónde están ubicados?",
      answer: locationParts || "Consulta ubicación con el negocio.",
      alternatePhrases: ["dirección", "ubicación", "dónde quedan"],
      keywords: ["ubicación", "dirección", "dónde"],
      category: ONBOARDING_SEED_FAQ_CATEGORY
    },
    {
      question: "¿Qué medios de pago aceptan?",
      answer: operations?.payment_methods?.length
        ? `Aceptamos: ${operations.payment_methods.join(", ")}.`
        : "Consulta medios de pago con el negocio.",
      alternatePhrases: ["formas de pago", "cómo puedo pagar", "aceptan tarjeta"],
      keywords: ["pago", "tarjeta", "transferencia"],
      category: ONBOARDING_SEED_FAQ_CATEGORY
    },
    {
      question: "¿Cómo puedo hablar con una persona?",
      answer:
        'Escribe "hablar con asesor" o "quiero una persona" y te conectamos con el equipo.',
      alternatePhrases: ["quiero un humano", "hablar con alguien", "asesor"],
      keywords: ["humano", "asesor", "persona"],
      category: ONBOARDING_SEED_FAQ_CATEGORY
    }
  ];

  for (const offering of offerings) {
    if (offering.price === undefined || offering.price === null || !offering.name?.trim()) continue;
    faqs.push({
      question: `¿Cuánto cuesta ${offering.name}?`,
      answer: `${offering.name} cuesta ${offering.price} ${offering.currency ?? "CLP"}.`,
      alternatePhrases: [`precio de ${offering.name}`, `valor ${offering.name}`],
      keywords: [offering.name.toLowerCase(), "precio"],
      category: ONBOARDING_SEED_FAQ_CATEGORY
    });
  }

  return faqs;
}

export { ONBOARDING_PROFILE_DOCUMENT_TITLE, ONBOARDING_SEED_FAQ_CATEGORY };
