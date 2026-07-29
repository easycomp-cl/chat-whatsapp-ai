import type { FlowDefinitionGraph } from "./flow-definition.schema.js";

export function createDefaultFlowGraph(name: string): FlowDefinitionGraph {
  return {
    name,
    version: 1,
    trigger: { type: "manual", channel: "whatsapp" },
    context: {
      contextWindow: {
        maxMessages: 30,
        maxAgeMinutes: 30,
        includeContactProfile: true
      }
    },
    fields: [],
    nodes: [
      { id: "start", type: "start", label: "Inicio", config: {} },
      {
        id: "collect-fields",
        type: "collect_fields",
        label: "Recopilar información",
        config: { strategy: "ask_missing_only" }
      },
      { id: "end", type: "end", label: "Fin", config: {} }
    ],
    edges: [
      { id: "e-start-collect", source: "start", target: "collect-fields" },
      { id: "e-collect-end", source: "collect-fields", target: "end" }
    ],
    outputSchemas: []
  };
}

/** Plantilla inicial para cotización de tablas personalizadas (caso §14). */
export function createWoodQuoteFlowGraph(name: string): FlowDefinitionGraph {
  return {
    name,
    version: 1,
    trigger: {
      type: "ai_intent",
      channel: "whatsapp",
      intent: "request_custom_quote",
      priority: 100
    },
    context: {
      contextWindow: {
        maxMessages: 30,
        maxAgeMinutes: 30,
        includeContactProfile: true
      }
    },
    fields: [
      { key: "customer.name", label: "Nombre", type: "text", required: true },
      { key: "product.type", label: "Tipo de tabla", type: "text", required: true },
      { key: "product.wood", label: "Madera", type: "text", required: true },
      { key: "product.size", label: "Tamaño", type: "text", required: true },
      { key: "product.quantity", label: "Cantidad", type: "number", required: true },
      { key: "engraving.type", label: "Tipo de grabado", type: "option", required: true, options: ["text", "logo"] },
      { key: "engraving.text", label: "Texto a grabar", type: "text", required: false },
      { key: "engraving.logoFile", label: "Archivo de logotipo", type: "file", required: false },
      { key: "delivery.requiredDate", label: "Fecha requerida", type: "date", required: true },
      { key: "delivery.method", label: "Método de entrega", type: "option", required: true, options: ["pickup", "delivery"] },
      { key: "delivery.address", label: "Dirección", type: "address", required: false }
    ],
    nodes: [
      { id: "start", type: "start", label: "Inicio", config: {} },
      {
        id: "analyze-conversation",
        type: "collect_fields",
        label: "Analizar conversación",
        config: { strategy: "extract_from_context", contextWindow: true }
      },
      {
        id: "collect-missing",
        type: "collect_fields",
        label: "Solicitar datos faltantes",
        config: { strategy: "ask_missing_only" }
      },
      {
        id: "engraving-choice",
        type: "choice",
        label: "¿Texto o logotipo?",
        config: {
          field: "engraving.type",
          options: [
            { value: "text", label: "Texto" },
            { value: "logo", label: "Logotipo" }
          ]
        }
      },
      {
        id: "collect-text",
        type: "collect_fields",
        label: "Capturar texto",
        config: { fields: ["engraving.text"] }
      },
      {
        id: "request-logo",
        type: "collect_fields",
        label: "Solicitar logo",
        config: {
          fields: ["engraving.logoFile"],
          strategy: "await_file",
          prompt: "Por favor envíanos tu logotipo en formato PNG o PDF."
        }
      },
      {
        id: "review-logo",
        type: "review",
        label: "Revisar logotipo",
        config: {
          subjectField: "engraving.logoFile",
          reviewMode: "human",
          maxAttempts: 3,
          approvedNextNodeId: "calculate-quote",
          rejectedNextNodeId: "request-logo",
          onMaxAttemptsNodeId: "human-handoff"
        }
      },
      {
        id: "calculate-quote",
        type: "action",
        label: "Calcular cotización",
        config: { action: "calculate_quote", useCatalog: true, useDelivery: true }
      },
      {
        id: "send-quote",
        type: "message",
        label: "Enviar cotización",
        config: {
          sender: "agent",
          template:
            "Hola {{customer.name}}, tu cotización es {{quote.total}} CLP. Entrega estimada: {{delivery.requiredDate}}.",
          requiredFields: [
            { key: "quote.total", label: "Total cotización", type: "number" },
            { key: "delivery.requiredDate", label: "Fecha entrega", type: "date" }
          ]
        }
      },
      {
        id: "confirm-summary",
        type: "confirmation",
        label: "Confirmar resumen",
        config: { summaryFields: ["product", "delivery", "quote"] }
      },
      {
        id: "emit-quote",
        type: "emit_event",
        label: "Generar JSON",
        config: { eventType: "quote.confirmed" }
      },
      {
        id: "human-handoff",
        type: "handoff",
        label: "Derivar a humano",
        config: { reason: "flow_max_attempts" }
      },
      { id: "end", type: "end", label: "Fin", config: {} }
    ],
    edges: [
      { id: "e1", source: "start", target: "analyze-conversation" },
      { id: "e2", source: "analyze-conversation", target: "collect-missing" },
      { id: "e3", source: "collect-missing", target: "engraving-choice" },
      { id: "e4", source: "engraving-choice", target: "collect-text", condition: { field: "engraving.type", operator: "equals", value: "text" } },
      { id: "e5", source: "engraving-choice", target: "request-logo", condition: { field: "engraving.type", operator: "equals", value: "logo" } },
      { id: "e6", source: "collect-text", target: "calculate-quote" },
      { id: "e7", source: "request-logo", target: "review-logo" },
      { id: "e8", source: "review-logo", target: "calculate-quote", condition: { field: "review.status", operator: "equals", value: "approved" } },
      { id: "e9", source: "calculate-quote", target: "send-quote" },
      { id: "e10", source: "send-quote", target: "confirm-summary" },
      { id: "e11", source: "confirm-summary", target: "emit-quote" },
      { id: "e12", source: "emit-quote", target: "end" }
    ],
    outputSchemas: [{ eventType: "quote.confirmed", schemaVersion: "1.0" }]
  };
}
