import { z } from "zod";

export const flowConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum([
    "equals",
    "not_equals",
    "contains",
    "greater_than",
    "less_than",
    "in",
    "not_in",
    "exists",
    "not_exists"
  ]),
  value: z.unknown().optional()
});

export type FlowCondition = z.infer<typeof flowConditionSchema>;

export const flowFieldDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum([
    "text",
    "number",
    "boolean",
    "date",
    "datetime",
    "email",
    "phone",
    "address",
    "option",
    "multi_option",
    "file",
    "object"
  ]),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  requiredWhen: flowConditionSchema.optional(),
  validation: z.record(z.unknown()).optional()
});

export const flowNodeTypeSchema = z.enum([
  "start",
  "message",
  "collect_fields",
  "choice",
  "condition",
  "review",
  "action",
  "wait",
  "handoff",
  "confirmation",
  "emit_event",
  "end"
]);

export const flowNodeSchema = z.object({
  id: z.string().min(1),
  type: flowNodeTypeSchema,
  label: z.string().optional(),
  config: z.record(z.unknown()).default({})
});

export const flowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  condition: flowConditionSchema.optional()
});

export const flowTriggerConfigSchema = z.object({
  type: z.enum(["manual", "ai_intent", "keyword", "webhook", "api"]),
  channel: z.enum(["whatsapp"]).optional(),
  keywords: z.array(z.string()).optional(),
  intent: z.string().optional(),
  priority: z.number().int().optional()
});

export const flowContextConfigSchema = z.object({
  contextWindow: z
    .object({
      maxMessages: z.number().int().positive().optional(),
      maxAgeMinutes: z.number().int().positive().optional(),
      includeContactProfile: z.boolean().optional()
    })
    .optional()
});

export const flowOutputSchemaSchema = z.object({
  eventType: z.string().min(1),
  schemaVersion: z.string().default("1.0")
});

export const flowDefinitionGraphSchema = z
  .object({
    name: z.string().min(1).optional(),
    version: z.number().int().positive().optional(),
    trigger: flowTriggerConfigSchema,
    context: flowContextConfigSchema.optional(),
    fields: z.array(flowFieldDefinitionSchema).default([]),
    nodes: z.array(flowNodeSchema).min(1),
    edges: z.array(flowEdgeSchema).default([]),
    outputSchemas: z.array(flowOutputSchemaSchema).default([])
  })
  .superRefine((graph, ctx) => {
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    if (!nodeIds.has("start") && !graph.nodes.some((n) => n.type === "start")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El grafo debe incluir un nodo start",
        path: ["nodes"]
      });
    }

    const duplicates = graph.nodes.map((n) => n.id).filter((id, i, arr) => arr.indexOf(id) !== i);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `IDs de nodo duplicados: ${[...new Set(duplicates)].join(", ")}`,
        path: ["nodes"]
      });
    }

    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.source)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge source desconocido: ${edge.source}`,
          path: ["edges"]
        });
      }
      if (!nodeIds.has(edge.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge target desconocido: ${edge.target}`,
          path: ["edges"]
        });
      }
    }
  });

export type FlowDefinitionGraph = z.infer<typeof flowDefinitionGraphSchema>;
export type FlowFieldDefinition = z.infer<typeof flowFieldDefinitionSchema>;
export type FlowNode = z.infer<typeof flowNodeSchema>;

export const flowTriggerInputSchema = z.object({
  trigger_type: z.enum(["MANUAL", "AI_INTENT", "KEYWORD", "WEBHOOK", "API"]),
  channel: z.enum(["WHATSAPP"]).optional(),
  priority: z.number().int().default(100),
  configuration_json: z.record(z.unknown()).default({}),
  is_enabled: z.boolean().default(true)
});

export type FlowTriggerInput = z.infer<typeof flowTriggerInputSchema>;

export function parseFlowDefinitionGraph(input: unknown): FlowDefinitionGraph {
  return flowDefinitionGraphSchema.parse(input);
}
