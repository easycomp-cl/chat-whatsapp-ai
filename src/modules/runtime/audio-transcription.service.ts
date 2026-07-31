import OpenAI, { toFile } from "openai";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { extensionFromMime } from "../conversations/message-media.utils.js";

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const TRANSCRIPTION_TIMEOUT_MS = 45_000;

export class AudioTranscriptionService {
  async transcribe(input: {
    buffer: Buffer;
    mimeType: string;
    filename?: string;
  }): Promise<string | null> {
    if (!env.OPENAI_API_KEY) {
      return null;
    }

    const ext = extensionFromMime(input.mimeType, "ogg");
    const filename = input.filename ?? `audio.${ext}`;

    try {
      const file = await toFile(input.buffer, filename, { type: input.mimeType });
      const transcription = await Promise.race([
        client.audio.transcriptions.create({
          model: "whisper-1",
          file,
          language: "es"
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("audio_transcription_timeout")), TRANSCRIPTION_TIMEOUT_MS);
        })
      ]);

      const text = transcription.text?.trim();
      return text || null;
    } catch (error) {
      logger.error({ err: error, filename }, "Failed to transcribe inbound audio");
      return null;
    }
  }
}

export const audioTranscriptionService = new AudioTranscriptionService();
