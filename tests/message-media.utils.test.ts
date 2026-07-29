import { describe, expect, it } from "vitest";
import { ContentType } from "@prisma/client";
import {
  contentTypeFromMime,
  sanitizeFilename,
  validateOutboundMediaMime,
  validateOutboundMediaSize
} from "../src/modules/conversations/message-media.utils.js";

describe("message-media.utils", () => {
  it("detects image and document mime types", () => {
    expect(contentTypeFromMime("image/jpeg")).toBe(ContentType.IMAGE);
    expect(contentTypeFromMime("image/png")).toBe(ContentType.IMAGE);
    expect(contentTypeFromMime("application/pdf")).toBe(ContentType.DOCUMENT);
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
