import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  extensionFromMime,
  isWhatsAppDirectAudioMime,
  normalizeMediaMimeType
} from "./message-media.utils.js";
import { MessageMediaHttpError } from "./message-media.errors.js";

const execFileAsync = promisify(execFile);

export type WhatsAppAudioPayload = {
  buffer: Buffer;
  mimeType: string;
  filename: string;
};

export async function prepareAudioBufferForWhatsApp(
  buffer: Buffer,
  mimeType: string,
  filename?: string | null
): Promise<WhatsAppAudioPayload> {
  const normalizedMime = normalizeMediaMimeType(mimeType);

  if (isWhatsAppDirectAudioMime(normalizedMime)) {
    const ext = extensionFromMime(normalizedMime, "ogg");
    return {
      buffer,
      mimeType: normalizedMime,
      filename: filename?.trim() || `audio.${ext}`
    };
  }

  const inputPath = join(tmpdir(), `wa-audio-in-${randomUUID()}`);
  const outputPath = join(tmpdir(), `wa-audio-out-${randomUUID()}.ogg`);

  try {
    await writeFile(inputPath, buffer);
    await execFileAsync(
      "ffmpeg",
      ["-y", "-i", inputPath, "-vn", "-c:a", "libopus", "-b:a", "32k", "-vbr", "on", outputPath],
      { timeout: 30_000, maxBuffer: 20 * 1024 * 1024 }
    );

    const { readFile } = await import("node:fs/promises");
    const transcoded = await readFile(outputPath);
    if (transcoded.length === 0) {
      throw new MessageMediaHttpError(
        "No se pudo convertir el audio para WhatsApp",
        400,
        "audio_transcode_failed"
      );
    }

    return {
      buffer: transcoded,
      mimeType: "audio/ogg",
      filename: replaceAudioExtension(filename, "ogg")
    };
  } catch (error) {
    if (error instanceof MessageMediaHttpError) {
      throw error;
    }

    const detail = error instanceof Error ? error.message : "error desconocido";
    throw new MessageMediaHttpError(
      `No se pudo convertir el audio para WhatsApp (${detail})`,
      400,
      "audio_transcode_failed"
    );
  } finally {
    await Promise.all([
      unlink(inputPath).catch(() => undefined),
      unlink(outputPath).catch(() => undefined)
    ]);
  }
}

function replaceAudioExtension(filename: string | null | undefined, ext: string): string {
  const base = filename?.trim() || "audio";
  const withoutExt = base.replace(/\.[^.]+$/, "");
  return `${withoutExt}.${ext}`;
}
