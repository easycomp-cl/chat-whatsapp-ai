import "dotenv/config";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const phoneNumberId = process.argv[2] ?? "1068250019704829";
const newToken = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
if (!newToken) {
  console.error("META_SYSTEM_USER_ACCESS_TOKEN no está en .env");
  process.exit(1);
}

function encrypt(plaintext) {
  const key = crypto.createHash("sha256").update(process.env.ENCRYPTION_SECRET).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decrypt(payload) {
  const key = crypto.createHash("sha256").update(process.env.ENCRYPTION_SECRET).digest();
  const [ivB64, tagB64, dataB64] = payload.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final()
  ]).toString("utf8");
}

const version = process.env.WHATSAPP_GRAPH_VERSION ?? "v20.0";
const check = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}`, {
  headers: { Authorization: `Bearer ${newToken}` }
});
const checkBody = await check.text();
console.log("Validación token .env:", check.status, checkBody.slice(0, 180));

if (!check.ok) {
  console.error("El token del .env tampoco es válido para este phone_number_id.");
  await prisma.$disconnect();
  process.exit(1);
}

const channel = await prisma.tenantChannel.findFirst({ where: { phoneNumberId } });
if (!channel) {
  console.error("Canal no encontrado");
  process.exit(1);
}

const oldToken = channel.accessTokenEncrypted ? decrypt(channel.accessTokenEncrypted) : null;
console.log("Token en BD distinto al .env:", oldToken !== newToken);

await prisma.tenantChannel.update({
  where: { id: channel.id },
  data: { accessTokenEncrypted: encrypt(newToken) }
});

console.log("Token sincronizado en TenantChannel para", phoneNumberId);
await prisma.$disconnect();
