/**
 * Migra webhook Meta al hostname api-chatbotmanager.easycomp.cl
 * Uso: npx tsx scripts/migrate-api-hostname.ts
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const NEW_CALLBACK = "https://api-chatbotmanager.easycomp.cl/webhooks/whatsapp";
const APP_ID = "1642810900259407";
const graphVersion = process.env.WHATSAPP_GRAPH_VERSION ?? "v20.0";
const appSecret = process.env.META_APP_SECRET?.trim();
const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
/** App access token requerido por /{app-id}/subscriptions */
const appAccessToken = `${APP_ID}|${appSecret}`;

if (!appSecret) throw new Error("Falta META_APP_SECRET en .env.production");
if (!verifyToken) throw new Error("Falta WHATSAPP_VERIFY_TOKEN en .env.production");

async function graphGet(pathname: string) {
  const url = `https://graph.facebook.com/${graphVersion}${pathname}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${appAccessToken}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(`GET ${pathname} -> ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function graphPost(pathname: string, params: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}${pathname}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${appAccessToken}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`POST ${pathname} -> ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function verifyWebhookProbe() {
  const probeUrl = new URL(NEW_CALLBACK);
  probeUrl.searchParams.set("hub.mode", "subscribe");
  probeUrl.searchParams.set("hub.verify_token", verifyToken!);
  probeUrl.searchParams.set("hub.challenge", "migrate-probe-200");
  const res = await fetch(probeUrl);
  const text = await res.text();
  return { status: res.status, body: text, ok: res.status === 200 && text === "migrate-probe-200" };
}

const before = await graphGet(`/${APP_ID}/subscriptions`);
console.log("Suscripciones actuales:", JSON.stringify(before, null, 2));

const update = await graphPost(`/${APP_ID}/subscriptions`, {
  object: "whatsapp_business_account",
  callback_url: NEW_CALLBACK,
  verify_token: verifyToken,
  fields: "messages",
});
console.log("Actualización Meta:", JSON.stringify(update, null, 2));

const after = await graphGet(`/${APP_ID}/subscriptions`);
console.log("Suscripciones después:", JSON.stringify(after, null, 2));

const probe = await verifyWebhookProbe();
console.log("Probe verify GET:", JSON.stringify(probe, null, 2));

if (!probe.ok) {
  throw new Error("Webhook probe falló — revisar WHATSAPP_VERIFY_TOKEN y backend ECS");
}

console.log("\n✓ Meta webhook migrado a", NEW_CALLBACK);
console.log("\nPendiente manual en Vercel (Production + Preview si aplica):");
console.log("  BOT_API_BASE_URL=" + NEW_CALLBACK.replace("/webhooks/whatsapp", ""));
