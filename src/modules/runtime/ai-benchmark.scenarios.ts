import type { ChatTurn } from "./conversation-history.js";
import type { BenchmarkScoreSpec } from "./ai-benchmark.scoring.js";

export const BENCHMARK_MODELS = [
  { id: "gpt-4o-mini", label: "GPT-4o mini (actual)" },
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini" }
] as const;

export type BenchmarkScenario = {
  id: string;
  title: string;
  category: "empresa" | "historial" | "memoria";
  userMessage: string;
  history: ChatTurn[];
  customerMemory: string;
  extraKnowledge?: string;
  score: BenchmarkScoreSpec;
};

export const PILOTO_CUSTOMER_MEMORY = `Nombre: Camila
Documento: Boleta
Despacho: Apoquindo 100, Las Condes
Forma de pago preferida: Transferencia
Alergias: barniz poliuretano
Pedido frecuente: tabla media camiseta`;

export function buildPilotoBenchmarkScenarios(): BenchmarkScenario[] {
  return [
    {
      id: "empresa-direccion",
      title: "Usa la dirección real del negocio",
      category: "empresa",
      userMessage: "hola, donde quedan?",
      history: [],
      customerMemory: PILOTO_CUSTOMER_MEMORY,
      score: {
        requireAny: ["Dalmacia", "Providencia"]
      }
    },
    {
      id: "empresa-precio-tabla",
      title: "Precio de la tabla desde FAQ",
      category: "empresa",
      userMessage: "cuanto sale la tabla?",
      history: [],
      customerMemory: PILOTO_CUSTOMER_MEMORY,
      score: {
        requireAny: ["19.900", "19900"]
      }
    },
    {
      id: "historial-destapador",
      title: "Resuelve 'ese' al destapador del hilo",
      category: "historial",
      userMessage: "y ese cuanto sale?",
      history: [
        { role: "user", content: "tienen destapadores?" },
        { role: "assistant", content: "Sí, tengo destapadores. ¿Cuántos necesitas?" }
      ],
      customerMemory: PILOTO_CUSTOMER_MEMORY,
      score: {
        requireAny: ["45.000", "45000"],
        forbidAny: ["19.900", "34.990"]
      }
    },
    {
      id: "historial-envio",
      title: "Recuerda el producto y responde el envío",
      category: "historial",
      userMessage: "y esa cuanto demora el envio?",
      history: [
        { role: "user", content: "me interesa la tabla media camiseta" },
        { role: "assistant", content: "Las tablas media camiseta salen $34.990 + envío." }
      ],
      customerMemory: PILOTO_CUSTOMER_MEMORY,
      score: {
        requireAny: ["2-3", "2 a 3", "dos a tres", "2 o 3"]
      }
    },
    {
      id: "memoria-pago",
      title: "Usa el método de pago favorito",
      category: "memoria",
      userMessage: "como te pago esta tabla?",
      history: [
        { role: "user", content: "quiero la tabla de $19.900" },
        { role: "assistant", content: "Perfecto, la tabla está $19.900." }
      ],
      customerMemory: PILOTO_CUSTOMER_MEMORY,
      score: {
        requireAny: ["transferencia"]
      }
    },
    {
      id: "memoria-pedido-frecuente",
      title: "Entiende 'lo de siempre'",
      category: "memoria",
      userMessage: "lo de siempre porfa",
      history: [
        { role: "user", content: "hola, soy camila" },
        { role: "assistant", content: "Hola Camila, dime cómo te ayudo." }
      ],
      customerMemory: PILOTO_CUSTOMER_MEMORY,
      score: {
        requireAny: ["media camiseta", "34.990", "34990"]
      }
    },
    {
      id: "memoria-alergia",
      title: "Respeta la alergia al barniz",
      category: "memoria",
      userMessage: "me pueden barnizar la tabla con poliuretano?",
      history: [
        { role: "user", content: "quiero una tabla personalizada" },
        { role: "assistant", content: "Claro, podemos grabar nombres o diseños." }
      ],
      customerMemory: PILOTO_CUSTOMER_MEMORY,
      extraKnowledge:
        "El taller puede terminar las tablas con aceite o con barniz de poliuretano. Si el cliente es alérgico al barniz de poliuretano, ofrecer aceite y no insistir en poliuretano.",
      score: {
        requireAny: ["alerg"]
      }
    },
    {
      id: "empresa-no-inventa",
      title: "No inventa un producto fuera del negocio",
      category: "empresa",
      userMessage: "venden iPhone 16 de 256gb? a cuanto?",
      history: [],
      customerMemory: PILOTO_CUSTOMER_MEMORY,
      score: {
        requireAny: ["derivar", "asesor", "no tengo", "no vendemos", "no trabajamos", "madera", "tablas"],
        forbidAny: ["desde $", "799", "iphone 16 de 256"]
      }
    }
  ];
}
