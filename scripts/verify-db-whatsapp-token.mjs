import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { createDecipheriv, createHash } from "node:crypto";

dotenv.config({ path: ".env.production" });

function decrypt(ciphertext, secret) {
  const key = createHash("sha256").update(secret).digest();
  const [ivB64, tagB64, dataB64] = ciphertext.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Formato cifrado invalido");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final()
  ]).toString("utf8");
}

const prisma = new PrismaClient();
const phoneNumberId = process.argv[2] ?? "1068250019704829";

const channel = await prisma.tenantChannel.findFirst({
  where: { phoneNumberId },
  select: { accessTokenEncrypted: true, updatedAt: true, phoneNumber: true }
});

if (!channel?.accessTokenEncrypted) {
  console.error("No hay token cifrado en BD para", phoneNumberId);
  process.exit(1);
}

console.log("BD updatedAt:", channel.updatedAt?.toISOString());
console.log("BD phoneNumber:", channel.phoneNumber);
console.log("ENCRYPTION_SECRET len:", process.env.ENCRYPTION_SECRET?.length ?? 0);

try {
  const plain = decrypt(channel.accessTokenEncrypted, process.env.ENCRYPTION_SECRET);
  console.log("decrypt: OK (EAA...)", plain.startsWith("EAA"), "len:", plain.length);

  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}`, {
    headers: { Authorization: `Bearer ${plain}` }
  });
  const json = await res.json();
  if (!res.ok) {
    console.error("Graph API con token DESCIFRADO de BD: FALLO", res.status, json.error?.message ?? json);
    process.exit(2);
  }
  console.log("Graph API con token DESCIFRADO de BD: OK");
  console.log("  display_phone_number:", json.display_phone_number);
  console.log("  verified_name:", json.verified_name);
} catch (error) {
  console.error("decrypt: FALLO -> ECS usaria META_SYSTEM_USER_ACCESS_TOKEN como fallback");
  console.error(" ", error.message);
  process.exit(3);
} finally {
  await prisma.$disconnect();
}
