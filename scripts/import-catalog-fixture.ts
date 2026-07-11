import { readFileSync } from "node:fs";
import path from "node:path";

const tenantId = process.env.TENANT_ID ?? "tenant-twd";
const baseUrl = (process.env.BOT_API_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  ""
);
const apiKey = process.env.INTERNAL_API_KEY ?? "easycomp_internal_api_key_dev";
const fixture = process.env.CATALOG_FIXTURE ?? "catalogo-twd.csv";

const csvPath = path.resolve("scripts/fixtures", fixture);
const csvText = readFileSync(csvPath, "utf8");

async function main() {
  const res = await fetch(
    `${baseUrl}/businesses/${tenantId}/catalog/import/csv`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ csv_text: csvText }),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Error:", data);
    process.exit(1);
  }

  console.log(
    `Importados ${data.products_imported} productos para ${tenantId}. Documento: ${data.documentId}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
