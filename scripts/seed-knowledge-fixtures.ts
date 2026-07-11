import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const tenantId = process.env.TENANT_ID ?? "tenant-twd";
const baseUrl = (process.env.BOT_API_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  ""
);
const apiKey = process.env.INTERNAL_API_KEY ?? "easycomp_internal_api_key_dev";
const fixturesDir = path.resolve("scripts/fixtures/knowledge");

const TITLE_OVERRIDES: Record<string, string> = {
  "politicas-panaderia-sol.txt": "Políticas del negocio",
  "despacho-y-retiro.txt": "Despacho, zonas y retiro en local",
  "encargos-tortas.txt": "Encargos y tortas personalizadas",
  "sobre-panaderia-sol.txt": "Sobre Panadería Sol",
};

async function createDocument(title: string, rawText: string) {
  if (!rawText.trim()) {
    throw new Error(`El documento "${title}" está vacío`);
  }
  const res = await fetch(
    `${baseUrl}/businesses/${tenantId}/knowledge-documents`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        title,
        source_type: "MANUAL",
        raw_text: rawText,
        auto_index: true,
      }),
    }
  );

  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return data.id!;
}

async function main() {
  const files = readdirSync(fixturesDir).filter((name) => name.endsWith(".txt"));
  if (!files.length) {
    console.error("No hay fixtures en", fixturesDir);
    process.exit(1);
  }

  for (const file of files) {
    const rawText = readFileSync(path.join(fixturesDir, file), "utf8");
    const title = TITLE_OVERRIDES[file] ?? file.replace(/\.txt$/, "");
    const id = await createDocument(title, rawText);
    console.log(`✓ ${title} → ${id}`);
  }

  console.log(`\n${files.length} documentos creados para ${tenantId} (indexación en cola).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
