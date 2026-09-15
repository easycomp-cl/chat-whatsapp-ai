import { describe, expect, it } from "vitest";
import { sanitizeQueueJobId } from "../src/modules/queue/message.queue.js";

describe("sanitizeQueueJobId", () => {
  it("removes colons from status job ids (BullMQ restriction)", () => {
    const jobId = sanitizeQueueJobId(
      "status-wamid.HBgLNTY5NDA0MTQ5NzcVAgARGBJCNzZDRUM1RDVDMDhGMzFEMzEA-delivered-1717888800000"
    );

    expect(jobId).not.toContain(":");
    expect(jobId).toContain("status-wamid");
    expect(jobId).toContain("delivered");
  });
});
