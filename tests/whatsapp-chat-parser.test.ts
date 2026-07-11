import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { whatsappChatParserService } from "../src/modules/chat-analysis/services/whatsapp-chat-parser.service.js";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../chat-whatsapp-ai-ui/data/Caro Barquín.txt"
);

describe("WhatsappChatParserService", () => {
  it("parses Spanish iOS export with narrow spaces and a. m. / p. m.", () => {
    const line =
      "[09-06-25, 9:27:20\u202Fp.\u00A0m.] ~Caro Barquín: Hola The Wood Club tengo una consulta";
    const parsed = whatsappChatParserService.parse(`${line}\n`);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.sender).toBe("~Caro Barquín");
    expect(parsed[0]?.message).toContain("Hola The Wood Club");
  });

  it("parses real TWD export fixture", () => {
    const content = readFileSync(fixturePath, "utf8");
    const parsed = whatsappChatParserService.parse(content);
    expect(parsed.length).toBeGreaterThan(20);

    const senders = new Set(parsed.map((m) => m.sender));
    expect(senders.has("The Wood Club")).toBe(true);
    expect([...senders].some((s) => s.includes("Caro"))).toBe(true);

    const withQuestion = parsed.find((m) =>
      m.message.toLowerCase().includes("personalizar")
    );
    expect(withQuestion).toBeDefined();
  });

  it("keeps user text when attachment notice is appended", () => {
    const line =
      "[15-06-26, 3:25:18 p. m.] ~Caro Barquín: Consulta , este pack se puede personalizar ? imagen omitida";
    const parsed = whatsappChatParserService.parse(`${line}\n`);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.message).toBe(
      "Consulta , este pack se puede personalizar ?"
    );
  });
});
