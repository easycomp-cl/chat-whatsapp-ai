import { describe, expect, it } from "vitest";
import { normalizeTeamMemberRole, serializeTeamMemberRole } from "../src/utils/team-member-role.js";

describe("team-member-role", () => {
  it("maps legacy agent to collaborator", () => {
    expect(normalizeTeamMemberRole("agent")).toBe("collaborator");
    expect(normalizeTeamMemberRole("AGENT")).toBe("collaborator");
  });

  it("keeps collaborator", () => {
    expect(serializeTeamMemberRole("collaborator")).toBe("collaborator");
  });
});
