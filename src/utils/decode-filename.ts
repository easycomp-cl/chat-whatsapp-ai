/**
 * Multer en Windows suele entregar nombres UTF-8 como string Latin-1.
 */
export function decodeUploadedFilename(filename: string): string {
  if (!filename) return filename;

  const hasNonAscii = [...filename].some((char) => char.charCodeAt(0) > 127);
  if (!hasNonAscii) return filename.normalize("NFC");

  let decoded = filename;

  if (/Ã.|Ì[\u0080-\u00BF]|[\u00C2-\u00C3][\u0080-\u00BF]/.test(filename)) {
    try {
      decoded = Buffer.from(filename, "latin1").toString("utf8");
    } catch {
      decoded = filename;
    }
  }

  return decoded.normalize("NFC");
}
