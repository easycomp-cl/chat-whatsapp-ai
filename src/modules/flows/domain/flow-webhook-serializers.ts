import type { FlowWebhookDelivery, FlowWebhookDeliveryAttempt } from "@prisma/client";

type DeliveryWithAttempts = FlowWebhookDelivery & {
  attempts?: FlowWebhookDeliveryAttempt[];
};

export function serializeFlowWebhookDelivery(delivery: DeliveryWithAttempts) {
  return {
    id: delivery.id,
    tenant_id: delivery.tenantId,
    flow_run_id: delivery.flowRunId,
    flow_run_event_id: delivery.flowRunEventId,
    node_id: delivery.nodeId,
    event_type: delivery.eventType,
    target_url: delivery.targetUrl,
    payload_json: delivery.payloadJson,
    status: delivery.status,
    attempt_count: delivery.attemptCount,
    max_attempts: delivery.maxAttempts,
    last_http_status: delivery.lastHttpStatus,
    last_error: delivery.lastError,
    last_attempt_at: delivery.lastAttemptAt,
    delivered_at: delivery.deliveredAt,
    next_retry_at: delivery.nextRetryAt,
    created_at: delivery.createdAt,
    updated_at: delivery.updatedAt,
    attempts: delivery.attempts?.map(serializeFlowWebhookDeliveryAttempt)
  };
}

export function serializeFlowWebhookDeliveryAttempt(attempt: FlowWebhookDeliveryAttempt) {
  return {
    id: attempt.id,
    delivery_id: attempt.deliveryId,
    attempt_number: attempt.attemptNumber,
    http_status: attempt.httpStatus,
    response_body: attempt.responseBody,
    error_message: attempt.errorMessage,
    duration_ms: attempt.durationMs,
    created_at: attempt.createdAt
  };
}
