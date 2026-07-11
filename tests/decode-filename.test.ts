import { describe, expect, it } from "vitest";
import { decodeUploadedFilename } from "../src/utils/decode-filename.js";

describe("decodeUploadedFilename", () => {
  it("fixes UTF-8 mojibake from multer latin1", () => {
    const wrong = Buffer.from("Caro Barquín.txt", "utf8").toString("latin1");
    expect(decodeUploadedFilename(wrong)).toBe("Caro Barquín.txt");
  });

  it("fixes NFD filenames corrupted via latin1 (peña)", () => {
    const wrong = `pen${String.fromCharCode(0xcc, 0x83)}a.txt`;
    expect(decodeUploadedFilename(wrong)).toBe("peña.txt");
  });

  it("leaves ASCII filenames unchanged", () => {
    expect(decodeUploadedFilename("Marcela Gonzalez.txt")).toBe("Marcela Gonzalez.txt");
  });
});
