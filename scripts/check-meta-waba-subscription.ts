/**
 * Verifica vinculación App ↔ WABA y suscripción de webhook en Meta.
 * Uso: npx tsx scripts/check-meta-waba-subscription.ts
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN?.trim();
const graphVersion = process.env.WHATSAPP_GRAPH_VERSION ?? "v20.0";
const phoneNumberId = "1245403151983186";
const wabaId = "1400503198602909";

if (!token) throw new Error("Falta META_SYSTEM_USER_ACCESS_TOKEN");

async function graphGet(path: string) {
  const url = `https://graph.facebook.com/${graphVersion}${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

const phone = await graphGet(
  `/${phoneNumberId}?fields=display_phone_number,verified_name`,
);

let subscribedApps: unknown = null;
let subscribedError: string | null = null;
try {
  subscribedApps = await graphGet(`/${wabaId}/subscribed_apps`);
} catch (e) {
  subscribedError = e instanceof Error ? e.message : String(e);
}

console.log(
  JSON.stringify(
    {
      phoneNumberId,
      phone: {
        display: phone.display_phone_number,
        verified_name: phone.verified_name,
        waba_id_expected: wabaId,
      },
      subscribed_apps: subscribedApps,
      subscribed_apps_error: subscribedError,
      hint:
        subscribedApps && Array.isArray((subscribedApps as { data?: unknown[] }).data)
          ? "Si data tiene tu App ID, la app está suscrita al WABA para webhooks."
          : "Si subscribed_apps falla o data vacío, hay que suscribir la app al WABA.",
    },
    null,
    2,
  ),
);
