import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { env } from "../src/config/env.js";

dotenv.config({ path: ".env.production", override: true });

const messageId = process.argv[2] ?? "cms4z2p2k0001swgmy3gk1xsg";

const prisma = new PrismaClient();
const message = await prisma.message.findUnique({
  where: { id: messageId },
  include: { conversation: { include: { customer: true, tenant: { include: { channels: { where: { isActive: true, status: "ACTIVE" }, take: 1 } } } } } }
});
await prisma.$disconnect();

if (!message?.externalId) process.exit(1);
const channel = message.conversation.tenant.channels[0]!;
const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN!;
const endpoint = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${channel.phoneNumberId}/messages`;
const to = message.conversation.customer.phoneNumber;
const wamid = message.externalId;
const newText = "Hola otra vez (test2)";

const payload = {
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to,
  type: "text",
  text: { body: newText },
  edit: { message_id: wamid }
};

console.log("Original wamid:", wamid);
const res = await fetch(endpoint, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});
const json = JSON.parse(await res.text());
console.log("Status:", res.status);
console.log(JSON.stringify(json, null, 2));
if (json.messages?.[0]?.id) {
  console.log("Returned wamid:", json.messages[0].id);
  console.log("Same as original?", json.messages[0].id === wamid);
}
