import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import type { IncomingMediaAttachment } from "../../types/whatsapp.js";
import { audioTranscriptionService } from "../runtime/audio-transcription.service.js";
import { messageMediaService } from "./message-media.service.js";

export type InboundAudioResult = {
  pipelineText: string;
  transcript: string | null;
  mediaStored: boolean;
};

export class InboundAudioService {
  async process(input: {
    tenantId: string;
    conversationId: string;
    messageId: string;
    accessToken: string;
    media: IncomingMediaAttachment;
  }): Promise<InboundAudioResult> {
    let mediaStored = false;

    try {
      await messageMediaService.ingestInboundFromWhatsApp({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        accessToken: input.accessToken,
        media: input.media
      });
      mediaStored = true;
    } catch (error) {
      logger.error(
        { err: error, messageId: input.messageId, mediaId: input.media.mediaId },
        "Failed to store inbound audio"
      );
      return {
        pipelineText: "[Audio]",
        transcript: null,
        mediaStored: false
      };
    }

    try {
      const file = await messageMediaService.readMessageMediaBuffer(
        input.tenantId,
        input.messageId
      );
      const transcript = await audioTranscriptionService.transcribe({
        buffer: file.buffer,
        mimeType: file.mimeType,
        ...(file.filename ? { filename: file.filename } : {})
      });

      if (!transcript) {
        return {
          pipelineText: "[Audio]",
          transcript: null,
          mediaStored
        };
      }

      await prisma.message.update({
        where: { id: input.messageId },
        data: {
          audioTranscript: transcript,
          contentText: transcript
        }
      });

      return {
        pipelineText: transcript,
        transcript,
        mediaStored
      };
    } catch (error) {
      logger.error({ err: error, messageId: input.messageId }, "Failed to transcribe inbound audio");
      return {
        pipelineText: "[Audio]",
        transcript: null,
        mediaStored
      };
    }
  }
}

export const inboundAudioService = new InboundAudioService();
