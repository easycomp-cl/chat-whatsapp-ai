import { describe, expect, it } from "vitest";
import { ContentType } from "@prisma/client";
import {
  contentTypeFromMime,
  sanitizeFilename,
  validateOutboundMediaMime,
  validateOutboundMediaSize
} from "../src/modules/conversations/message-media.utils.js";

describe("message-media.utils", () => {
  it("detects image, audio and document mime types", () => {
    expect(contentTypeFromMime("image/jpeg")).toBe(ContentType.IMAGE);
    expect(contentTypeFromMime("image/png")).toBe(ContentType.IMAGE);
    expect(contentTypeFromMime("audio/ogg")).toBe(ContentType.AUDIO);
    expect(contentTypeFromMime("audio/mpeg")).toBe(ContentType.AUDIO);
    expect(contentTypeFromMime("application/pdf")).toBe(ContentType.DOCUMENT);
  });

  it("validates outbound audio mime and size limits", () => {
    const audio = validateOutboundMediaMime("audio/ogg");
    expect(audio.ok).toBe(true);
    if (audio.ok) {
      expect(audio.contentType).toBe(ContentType.AUDIO);
      expect(validateOutboundMediaSize(audio.contentType, 10 * 1024 * 1024)).toBeNull();
      expect(validateOutboundMediaSize(audio.contentType, 17 * 1024 * 1024)).toContain("16 MB");
    }
  });

  it("validates outbound mime and size limits", () => {
    const image = validateOutboundMediaMime("image/png");
    expect(image.ok).toBe(true);
    if (image.ok) {
      expect(validateOutboundMediaSize(image.contentType, 4 * 1024 * 1024)).toBeNull();
      expect(validateOutboundMediaSize(image.contentType, 6 * 1024 * 1024)).toContain("5 MB");
    }

    const rejected = validateOutboundMediaMime("image/gif");
    expect(rejected.ok).toBe(false);
  });

  it("sanitizes unsafe filenames", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("____etc_passwd");
    expect(sanitizeFilename(" cotización #1.pdf ")).toContain("cotizaci");
  });
});
