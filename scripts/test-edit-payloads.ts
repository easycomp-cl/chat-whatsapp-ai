import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { env } from "../src/config/env.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const messageId = process.argv[2];
if (!messageId) {
  console.error("Usage: npx tsx scripts/test-edit-payloads.ts <messageId>");
  process.exit(1);
}

const prisma = new PrismaClient();
const message = await prisma.message.findUnique({
  where: { id: messageId },
  include: { conversation: { include: { customer: true } } }
});
await prisma.$disconnect();

if (!message?.externalId) {
  console.error("Message not found or missing externalId");
  process.exit(1);
}

const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN!;
const phoneNumberId = "1245403151983186";
const to = message.conversation.customer.phoneNumber;
const wamid = message.externalId;
const newText = `${message.contentText} [edit-test ${Date.now()}]`;
const endpoint = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${phoneNumberId}/messages`;

const payloads: Array<{ name: string; body: Record<string, unknown> }> = [
  {
    name: "edit-object-with-text-inside-no-type",
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      edit: { message_id: wamid, text: { body: newText } }
    }
  },
  {
    name: "edit-string-top-level",
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      edit: wamid,
      text: { body: newText }
    }
  },
  {
    name: "type-edit",
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "edit",
      edit: { message_id: wamid, text: { body: newText } }
    }
  },
  {
    name: "current-broken-type-text-plus-edit",
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: newText },
      edit: { message_id: wamid }
    }
  }
];

for (const item of payloads) {
  console.log(`\n=== ${item.name} ===`);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(item.body)
  });
  const text = await res.text();
  console.log("status:", res.status);
  console.log(text);
}
