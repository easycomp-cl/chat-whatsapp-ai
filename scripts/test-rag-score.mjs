import { ragService } from "../src/modules/rag/rag.service.js";
import { faqEngine } from "../src/modules/faq/faq.engine.js";

const tenantId = "tenant-panaderia-sol";
const queries = [
  "¿Cuánto cuesta la hallulla?",
  "precio hallulla",
  "Hallulla x6 precio",
  "¿Cuánto sale la hallulla x6?"
];

for (const q of queries) {
  const faq = await faqEngine.findMatch(tenantId, q);
  const hits = await ragService.retrieve(tenantId, q);
  const best = ragService.getBestScore(hits);
  console.log("\n---", q);
  console.log("FAQ:", faq ? `${faq.matchType} score=${faq.score}` : "null");
  console.log("RAG bestScore:", best, best >= 0.7 ? "PASS" : "FAIL (<0.7)");
  for (const h of hits) {
    console.log(`  score=${h.score.toFixed(4)} | ${h.chunkText.slice(0, 100)}`);
  }
}
