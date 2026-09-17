/**
 * Carga el catálogo demo (40 SKUs) en EasyComp Repuestos.
 *
 *   npx tsx scripts/load-easycomp-repuestos-catalog.ts
 */
import dotenv from "dotenv";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const SLUG = process.env.TENANT_SLUG ?? "easycomp-repuestos";
const csvPath = path.join(root, "scripts/fixtures/catalogo-easycomp-repuestos.csv");

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { catalogService } = await import("../src/modules/catalog/catalog.service.js");
  const prisma = new PrismaClient();

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: SLUG },
      select: { id: true, name: true, slug: true }
    });
    if (!tenant) {
      throw new Error(`No existe el tenant con slug ${SLUG}`);
    }

    const csvText = readFileSync(csvPath, "utf8");
    const result = await catalogService.importCsv(tenant.id, csvText);
    const count = await prisma.tenantCatalogProduct.count({
      where: { tenantId: tenant.id, isActive: true }
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          tenant,
          products_imported: result.products_imported,
          catalog_document_id: result.documentId,
          active_products: count
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
