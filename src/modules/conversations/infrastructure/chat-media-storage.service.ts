import { env } from "../../../config/env.js";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../lib/supabase-admin.js";
import { storageService } from "../../storage/storage.service.js";
import { isEnoentError } from "../message-media.utils.js";

export type StoredMediaObject = {
  storageBackend: "supabase" | "local";
  storageBucket: string;
  storagePath: string;
};

export class ChatMediaStorageService {
  get supabaseBucket(): string {
    return env.SUPABASE_CHAT_MEDIA_BUCKET;
  }

  get localBucket(): string {
    return "local";
  }

  isSupabaseEnabled(): boolean {
    return isSupabaseConfigured();
  }

  async saveBuffer(input: {
    storagePath: string;
    buffer: Buffer;
    mimeType?: string;
  }): Promise<StoredMediaObject> {
    if (this.isSupabaseEnabled()) {
      const supabase = getSupabaseAdminClient();
      const { error } = await supabase.storage.from(this.supabaseBucket).upload(input.storagePath, input.buffer, {
        contentType: input.mimeType ?? "application/octet-stream",
        upsert: false
      });

      if (error) {
        throw new Error(`Error subiendo media de chat a Supabase: ${error.message}`);
      }

      return {
        storageBackend: "supabase",
        storageBucket: this.supabaseBucket,
        storagePath: input.storagePath
      };
    }

    const parts = input.storagePath.split("/");
    const messageId = parts[parts.length - 2] ?? "unknown";
    const conversationId = parts[parts.length - 4] ?? "unknown";
    const tenantId = parts[1] ?? "unknown";
    const filename = parts[parts.length - 1] ?? "archivo";

    const saved = await storageService.saveMessageMedia({
      tenantId,
      conversationId,
      messageId,
      filename,
      buffer: input.buffer
    });

    return {
      storageBackend: "local",
      storageBucket: this.localBucket,
      storagePath: saved.storagePath
    };
  }

  async readBuffer(storageBucket: string, storagePath: string): Promise<Buffer> {
    if (storageBucket === this.localBucket || storageBucket === "local") {
      try {
        return await storageService.readByStoragePath(storagePath);
      } catch (error) {
        if (isEnoentError(error)) {
          throw new Error(`MEDIA_NOT_FOUND: ${storagePath}`, { cause: error });
        }
        throw error;
      }
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.storage.from(storageBucket).download(storagePath);
    if (error || !data) {
      throw new Error(
        `MEDIA_NOT_FOUND: ${error?.message ?? "archivo no encontrado"} (${storageBucket}/${storagePath})`
      );
    }

    return Buffer.from(await data.arrayBuffer());
  }

  async createAccessUrl(
    storageBucket: string,
    storagePath: string,
    expiresInSeconds = 3600
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.storage
      .from(storageBucket)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new Error("No se pudo generar URL firmada para el archivo");
    }

    return {
      url: data.signedUrl,
      expiresInSeconds
    };
  }
}

export const chatMediaStorageService = new ChatMediaStorageService();
