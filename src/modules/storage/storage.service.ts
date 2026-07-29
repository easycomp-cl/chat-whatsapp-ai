import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";

export class StorageService {
  private basePath = path.resolve(env.STORAGE_PATH);

  private tenantDir(tenantId: string): string {
    return path.join(this.basePath, "tenants", tenantId, "documents");
  }

  buildStorageKey(tenantId: string, documentId: string, extension: string): string {
    const safeExt = extension.replace(/[^a-z0-9.]/gi, "").toLowerCase() || ".bin";
    return `tenants/${tenantId}/documents/${documentId}${safeExt.startsWith(".") ? safeExt : `.${safeExt}`}`;
  }

  buildChatImportKey(tenantId: string, importJobId: string, extension: string): string {
    const safeExt = extension.replace(/[^a-z0-9.]/gi, "").toLowerCase() || ".bin";
    return `tenants/${tenantId}/chat-imports/${importJobId}${safeExt.startsWith(".") ? safeExt : `.${safeExt}`}`;
  }

  buildMessageMediaKey(
    tenantId: string,
    conversationId: string,
    messageId: string,
    filename: string
  ): string {
    const safeName = filename.replace(/[/\\]/g, "_").replace(/\.\./g, "_").trim() || "archivo";
    return `tenants/${tenantId}/conversations/${conversationId}/messages/${messageId}/${safeName}`;
  }

  async saveMessageMedia(input: {
    tenantId: string;
    conversationId: string;
    messageId: string;
    filename: string;
    buffer: Buffer;
  }): Promise<{ storagePath: string; fileSize: number }> {
    const storagePath = this.buildMessageMediaKey(
      input.tenantId,
      input.conversationId,
      input.messageId,
      input.filename
    );
    const absolutePath = path.join(this.basePath, storagePath.replace(/^tenants\//, "tenants/"));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.buffer);
    return { storagePath, fileSize: input.buffer.length };
  }

  async saveChatImport(input: {
    tenantId: string;
    importJobId: string;
    buffer: Buffer;
    extension: string;
  }): Promise<{ storagePath: string; fileSize: number }> {
    const storagePath = this.buildChatImportKey(input.tenantId, input.importJobId, input.extension);
    const absolutePath = path.join(this.basePath, storagePath.replace(/^tenants\//, "tenants/"));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.buffer);
    return { storagePath, fileSize: input.buffer.length };
  }

  async saveDocument(input: {
    tenantId: string;
    documentId: string;
    buffer: Buffer;
    extension: string;
  }): Promise<{ storagePath: string; fileSize: number }> {
    const storagePath = this.buildStorageKey(input.tenantId, input.documentId, input.extension);
    const absolutePath = path.join(this.basePath, storagePath.replace(/^tenants\//, "tenants/"));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.buffer);
    return { storagePath, fileSize: input.buffer.length };
  }

  async readByStoragePath(storagePath: string): Promise<Buffer> {
    const absolutePath = path.join(this.basePath, storagePath);
    return readFile(absolutePath);
  }

  async deleteByStoragePath(storagePath: string): Promise<void> {
    try {
      const absolutePath = path.join(this.basePath, storagePath);
      await unlink(absolutePath);
    } catch {
      // archivo ya eliminado o inexistente
    }
  }

  publicUrl(storagePath: string): string {
    return `/storage/${storagePath}`;
  }
}

export const storageService = new StorageService();
