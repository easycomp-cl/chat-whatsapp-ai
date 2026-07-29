import type {
  FlowDefinition,
  FlowReview,
  FlowRun,
  FlowTrigger,
  FlowVersion,
  TenantAdmin
} from "@prisma/client";

type FlowDefinitionWithRelations = FlowDefinition & {
  currentVersion?: (FlowVersion & { triggers?: FlowTrigger[] }) | null;
  createdByAdmin?: Pick<TenantAdmin, "id" | "name">;
  updatedByAdmin?: Pick<TenantAdmin, "id" | "name"> | null;
  _count?: { versions: number };
};

type FlowVersionWithRelations = FlowVersion & {
  triggers?: FlowTrigger[];
  createdByAdmin?: Pick<TenantAdmin, "id" | "name">;
};

export function serializeFlowDefinition(flow: FlowDefinitionWithRelations) {
  return {
    id: flow.id,
    tenant_id: flow.tenantId,
    name: flow.name,
    description: flow.description,
    status: flow.status,
    current_version_id: flow.currentVersionId,
    current_version: flow.currentVersion
      ? serializeFlowVersion(flow.currentVersion, { include_graph: false })
      : null,
    versions_count: flow._count?.versions ?? undefined,
    created_by_admin_id: flow.createdByAdminId,
    created_by_admin: flow.createdByAdmin
      ? { id: flow.createdByAdmin.id, name: flow.createdByAdmin.name }
      : undefined,
    updated_by_admin_id: flow.updatedByAdminId,
    updated_by_admin: flow.updatedByAdmin
      ? { id: flow.updatedByAdmin.id, name: flow.updatedByAdmin.name }
      : null,
    created_at: flow.createdAt,
    updated_at: flow.updatedAt
  };
}

export function serializeFlowVersion(
  version: FlowVersionWithRelations,
  options: { include_graph?: boolean } = {}
) {
  const includeGraph = options.include_graph !== false;
  return {
    id: version.id,
    tenant_id: version.tenantId,
    flow_definition_id: version.flowDefinitionId,
    version_number: version.versionNumber,
    status: version.status,
    published_at: version.publishedAt,
    graph_json: includeGraph ? version.graphJson : undefined,
    triggers: version.triggers?.map(serializeFlowTrigger) ?? undefined,
    created_by_admin_id: version.createdByAdminId,
    created_by_admin: version.createdByAdmin
      ? { id: version.createdByAdmin.id, name: version.createdByAdmin.name }
      : undefined,
    created_at: version.createdAt
  };
}

export function serializeFlowTrigger(trigger: FlowTrigger) {
  return {
    id: trigger.id,
    tenant_id: trigger.tenantId,
    flow_version_id: trigger.flowVersionId,
    trigger_type: trigger.triggerType,
    channel: trigger.channel,
    priority: trigger.priority,
    configuration_json: trigger.configurationJson,
    is_enabled: trigger.isEnabled,
    has_webhook_secret: Boolean(trigger.webhookSecretHash),
    created_at: trigger.createdAt
  };
}

export function serializeFlowRun(run: FlowRun) {
  return {
    id: run.id,
    tenant_id: run.tenantId,
    flow_version_id: run.flowVersionId,
    conversation_id: run.conversationId,
    customer_id: run.customerId,
    current_node_id: run.currentNodeId,
    status: run.status,
    variables_json: run.variablesJson,
    pending_agent_input: run.pendingAgentInputJson,
    started_by: run.startedBy,
    started_by_admin_id: run.startedByAdminId,
    lock_version: run.lockVersion,
    started_at: run.startedAt,
    updated_at: run.updatedAt,
    completed_at: run.completedAt
  };
}

export function serializeFlowReview(review: FlowReview) {
  return {
    id: review.id,
    tenant_id: review.tenantId,
    flow_run_id: review.flowRunId,
    node_id: review.nodeId,
    reviewer_admin_id: review.reviewerAdminId,
    subject_type: review.subjectType,
    subject_reference: review.subjectReference,
    status: review.status,
    resolution: review.resolution,
    notes: review.notes,
    attempt: review.attempt,
    created_at: review.createdAt,
    resolved_at: review.resolvedAt
  };
}
