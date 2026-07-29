import type { FlowCondition, FlowDefinitionGraph, FlowNode } from "./flow-definition.schema.js";

export function getStartNode(graph: FlowDefinitionGraph): FlowNode {
  return graph.nodes.find((n) => n.type === "start") ?? graph.nodes[0]!;
}

export function getNode(graph: FlowDefinitionGraph, nodeId: string): FlowNode | undefined {
  return graph.nodes.find((n) => n.id === nodeId);
}

export function getOutgoingEdges(graph: FlowDefinitionGraph, nodeId: string) {
  return graph.edges.filter((e) => e.source === nodeId);
}

export function resolveNextNodeId(
  graph: FlowDefinitionGraph,
  currentNodeId: string,
  variables: Record<string, unknown>
): string | null {
  const edges = getOutgoingEdges(graph, currentNodeId);
  if (edges.length === 0) {
    return null;
  }

  for (const edge of edges) {
    if (!edge.condition || evaluateCondition(edge.condition, variables)) {
      return edge.target;
    }
  }

  return edges[0]?.target ?? null;
}

export function evaluateCondition(condition: FlowCondition, variables: Record<string, unknown>): boolean {
  const actual = getNestedValue(variables, condition.field);

  switch (condition.operator) {
    case "equals":
      return actual === condition.value;
    case "not_equals":
      return actual !== condition.value;
    case "contains":
      return String(actual ?? "")
        .toLowerCase()
        .includes(String(condition.value ?? "").toLowerCase());
    case "greater_than":
      return Number(actual) > Number(condition.value);
    case "less_than":
      return Number(actual) < Number(condition.value);
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(actual);
    case "not_in":
      return Array.isArray(condition.value) && !condition.value.includes(actual);
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    case "not_exists":
      return actual === undefined || actual === null || actual === "";
    default:
      return false;
  }
}

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  const parts = path.split(".");
  const root = { ...obj };
  let cursor: Record<string, unknown> = root;

  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    const next = cursor[part];
    cursor[part] =
      next != null && typeof next === "object" && !Array.isArray(next)
        ? { ...(next as Record<string, unknown>) }
        : {};
    cursor = cursor[part] as Record<string, unknown>;
  }

  cursor[parts[parts.length - 1]!] = value;
  return root;
}

export function interpolateTemplate(
  template: string,
  variables: Record<string, unknown>
): string {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, key: string) => {
    const value = getNestedValue(variables, key.trim());
    return value == null ? "" : String(value);
  });
}

export const AFFIRMATIVE_REPLIES = new Set([
  "si",
  "sí",
  "yes",
  "ok",
  "dale",
  "correcto",
  "confirmo",
  "esta bien",
  "está bien",
  "de acuerdo"
]);

export const NEGATIVE_REPLIES = new Set(["no", "nop", "negativo", "incorrecto"]);

export function parseYesNo(text: string): "yes" | "no" | null {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  if (AFFIRMATIVE_REPLIES.has(normalized)) {
    return "yes";
  }
  if (NEGATIVE_REPLIES.has(normalized)) {
    return "no";
  }
  return null;
}
