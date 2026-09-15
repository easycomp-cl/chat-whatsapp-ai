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

if (!message?.externalId) {
  console.error("Message not found");
  process.exit(1);
}

const channel = message.conversation.tenant.channels[0];
if (!channel) {
  console.error("No channel");
  process.exit(1);
}

const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN!;
const endpoint = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${channel.phoneNumberId}/messages`;
const to = message.conversation.customer.phoneNumber;
const wamid = message.externalId;
const newText = "Hola otra vez (test edit payload)";

const payload = {
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to,
  edit: { message_id: wamid, text: { body: newText } }
};

console.log("Original wamid:", wamid);
console.log("Payload:", JSON.stringify(payload, null, 2));

const res = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(payload)
});

const text = await res.text();
console.log("Status:", res.status);
console.log("Response:", text);
