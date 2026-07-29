import { env } from "../../../config/env.js";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../lib/supabase-admin.js";
import { FlowHttpError } from "../flows.errors.js";

let client: ReturnType<typeof getSupabaseAdminClient> | null = null;

function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    throw new FlowHttpError(
      "Supabase Storage no está configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
      503,
      "supabase_not_configured"
    );
  }

  if (!client) {
    client = getSupabaseAdminClient();
  }

  return client;
}

export function buildFlowFileStoragePath(input: {
  tenantId: string;
  conversationId: string;
  flowRunId?: string;
  messageExternalId: string;
  filename: string;
}): string {
  const runSegment = input.flowRunId ? `runs/${input.flowRunId}` : "runs/unassigned";
  return [
    "tenants",
    input.tenantId,
    "conversations",
    input.conversationId,
    runSegment,
    "inbound",
    input.messageExternalId,
    input.filename
  ].join("/");
}

export class FlowSupabaseStorageService {
  get bucket(): string {
    return env.SUPABASE_FLOW_FILES_BUCKET;
  }

  isConfigured(): boolean {
    return isSupabaseConfigured();
  }

  async uploadBuffer(input: {
    storagePath: string;
    buffer: Buffer;
    mimeType?: string;
  }): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.storage.from(this.bucket).upload(input.storagePath, input.buffer, {
      contentType: input.mimeType ?? "application/octet-stream",
      upsert: false
    });

    if (error) {
      throw new FlowHttpError(`Error subiendo archivo a Supabase: ${error.message}`, 500);
    }
  }

  async createSignedUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new FlowHttpError("No se pudo generar URL firmada", 500);
    }

    return data.signedUrl;
  }
}

export const flowSupabaseStorageService = new FlowSupabaseStorageService();
