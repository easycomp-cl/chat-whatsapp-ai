import { PrismaClient } from "@prisma/client";
import { knowledgeIndexerService } from "../src/modules/knowledge/knowledge-indexer.service.js";
import { faqEngine } from "../src/modules/faq/faq.engine.js";

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  for (const tenant of tenants) {
    const docs = await prisma.tenantDocument.findMany({
      where: { tenantId: tenant.id, status: "PENDING" }
    });

    for (const doc of docs) {
      const result = await knowledgeIndexerService.indexDocument(doc.id);
      console.log(`Indexed ${tenant.name} / ${doc.title}: ${result.chunksIndexed} chunks`);
    }

    await faqEngine.indexFaqEmbeddings(tenant.id);
    console.log(`FAQ embeddings indexed for ${tenant.name}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
