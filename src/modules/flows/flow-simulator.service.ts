import type { FlowDefinitionGraph, FlowFieldDefinition } from "./domain/flow-definition.schema.js";
import { parseFlowDefinitionGraph } from "./domain/flow-definition.schema.js";

export interface SimulateMessageInput {
  role: "customer" | "agent" | "system";
  content: string;
  createdAt?: string;
}

export interface FlowSimulationResult {
  detected_intent: string | null;
  captured_fields: Record<string, unknown>;
  missing_fields: string[];
  doubtful_fields: string[];
  current_node_id: string | null;
  next_node_id: string | null;
  next_message: string | null;
  evaluated_conditions: Array<{
    edge_id: string;
    matched: boolean;
    reason: string;
  }>;
  output_preview: Record<string, unknown> | null;
  logs: string[];
}

function getStartNodeId(graph: FlowDefinitionGraph): string {
  const start = graph.nodes.find((n) => n.type === "start");
  return start?.id ?? graph.nodes[0]?.id ?? "start";
}

function getNextNodeId(graph: FlowDefinitionGraph, currentNodeId: string): string | null {
  const edge = graph.edges.find((e) => e.source === currentNodeId);
  return edge?.target ?? null;
}

function getRequiredFields(graph: FlowDefinitionGraph): FlowFieldDefinition[] {
  return graph.fields.filter((f) => f.required);
}

function buildCollectMessage(missing: FlowFieldDefinition[]): string {
  if (missing.length === 0) {
    return "Gracias, tengo toda la información que necesito por ahora.";
  }
  if (missing.length === 1) {
    return `¿Podrías indicarme ${missing[0]!.label.toLowerCase()}?`;
  }
  const labels = missing.map((f) => f.label.toLowerCase());
  const last = labels.pop();
  return `Necesito algunos datos más: ${labels.join(", ")} y ${last}.`;
}

function messageFromNode(graph: FlowDefinitionGraph, nodeId: string): string | null {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) {
    return null;
  }
  if (node.type === "message" && typeof node.config.text === "string") {
    return node.config.text;
  }
  if (node.type === "collect_fields") {
    const required = getRequiredFields(graph);
    return buildCollectMessage(required);
  }
  if (node.type === "confirmation") {
    return "¿Confirmas que la información es correcta?";
  }
  if (node.type === "choice" && Array.isArray(node.config.options)) {
    const options = node.config.options as Array<{ label?: string; value?: string }>;
    const lines = options.map((o, i) => `${i + 1}. ${o.label ?? o.value ?? "Opción"}`);
    return ["Elige una opción:", ...lines].join("\n");
  }
  return null;
}

function detectIntent(graph: FlowDefinitionGraph): string | null {
  if (graph.trigger.type === "ai_intent" && graph.trigger.intent) {
    return graph.trigger.intent;
  }
  if (graph.trigger.type === "keyword" && graph.trigger.keywords?.length) {
    return `keyword:${graph.trigger.keywords[0]}`;
  }
  return graph.trigger.type;
}

function simpleKeywordCapture(
  graph: FlowDefinitionGraph,
  messages: SimulateMessageInput[]
): Record<string, unknown> {
  const captured: Record<string, unknown> = {};
  const customerText = messages
    .filter((m) => m.role === "customer")
    .map((m) => m.content.toLowerCase())
    .join(" ");

  if (!customerText) {
    return captured;
  }

  for (const field of graph.fields) {
    if (field.type === "number" && /(\d+)\s*(tabla|tablas)/i.test(customerText)) {
      const match = customerText.match(/(\d+)\s*(tabla|tablas)/i);
      if (match) {
        captured[field.key === "product.quantity" ? field.key : "product.quantity"] = Number(match[1]);
      }
    }
    if (field.key === "product.wood" && /(raul[ií]|coig[uü]e|roble|olivo)/i.test(customerText)) {
      const match = customerText.match(/(raul[ií]|coig[uü]e|roble|olivo)/i);
      if (match) {
        captured["product.wood"] = match[1];
      }
    }
  }

  return captured;
}

export class FlowSimulatorService {
  simulate(graphInput: unknown, messages: SimulateMessageInput[]): FlowSimulationResult {
    const graph = parseFlowDefinitionGraph(graphInput);
    const logs: string[] = [];
    const captured = simpleKeywordCapture(graph, messages);
    const required = getRequiredFields(graph);
    const missing = required.filter((f) => captured[f.key] === undefined).map((f) => f.key);

    const startNodeId = getStartNodeId(graph);
    logs.push(`Nodo inicial: ${startNodeId}`);

    let currentNodeId = startNodeId;
    let hops = 0;
    const maxHops = 20;

    while (hops < maxHops) {
      const node = graph.nodes.find((n) => n.id === currentNodeId);
      if (!node) {
        break;
      }

      logs.push(`Visitando nodo ${node.id} (${node.type})`);

      if (node.type === "end") {
        break;
      }

      if (node.type === "collect_fields" && missing.length > 0) {
        break;
      }

      if (node.type === "condition" || node.type === "review" || node.type === "action") {
        logs.push(`Nodo ${node.type} se evaluará en ejecución real (PR3)`);
      }

      const nextNodeId = getNextNodeId(graph, currentNodeId);
      if (!nextNodeId) {
        break;
      }

      currentNodeId = nextNodeId;
      hops += 1;
    }

    const nextMessage =
      messageFromNode(graph, currentNodeId) ??
      (missing.length > 0 ? buildCollectMessage(required.filter((f) => missing.includes(f.key))) : null);

    const evaluatedConditions = graph.edges.map((edge) => ({
      edge_id: edge.id,
      matched: edge.source === startNodeId,
      reason: edge.condition ? "Condición pendiente de motor completo" : "Sin condición"
    }));

    return {
      detected_intent: detectIntent(graph),
      captured_fields: captured,
      missing_fields: missing,
      doubtful_fields: [],
      current_node_id: currentNodeId,
      next_node_id: getNextNodeId(graph, currentNodeId),
      next_message: nextMessage,
      evaluated_conditions: evaluatedConditions,
      output_preview:
        graph.outputSchemas.length > 0
          ? {
              schema_version: graph.outputSchemas[0]!.schemaVersion,
              event_type: graph.outputSchemas[0]!.eventType,
              fields: captured
            }
          : null,
      logs
    };
  }
}

export const flowSimulatorService = new FlowSimulatorService();
