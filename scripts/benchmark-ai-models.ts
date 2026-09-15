import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const PILOTO_SLUG = "easycomp-piloto";

type ModelRun = {
  model: string;
  label: string;
  error?: string;
  reply: string;
  latencyMs: number;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
  passed: boolean;
  score: number;
  matched: string[];
  missed: string[];
  forbiddenHits: string[];
};

function formatFaqKnowledge(faqs: Array<{ question: string; answer: string }>): string {
  return faqs.map((faq, index) => `[FAQ ${index + 1}] ${faq.question}\n${faq.answer}`).join("\n\n");
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { BENCHMARK_MODELS, buildPilotoBenchmarkScenarios } = await import(
    "../src/modules/runtime/ai-benchmark.scenarios.js"
  );
  const { scoreBenchmarkReply } = await import("../src/modules/runtime/ai-benchmark.scoring.js");
  const { buildRuntimeSystemPrompt } = await import("../src/modules/runtime/prompts.js");
  const { ragService } = await import("../src/modules/rag/rag.service.js");
  const { buildRetrievalQuery } = await import("../src/modules/runtime/conversation-history.js");
  const { openAiService } = await import("../src/modules/runtime/openai.service.js");

  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findFirst({
      where: { slug: PILOTO_SLUG },
      include: {
        config: true,
        faqs: { where: { isActive: true }, orderBy: { priority: "desc" } }
      }
    });
    if (!tenant?.config) {
      throw new Error(`No encontré el tenant ${PILOTO_SLUG}`);
    }

    const faqKnowledge = formatFaqKnowledge(tenant.faqs);
    const scenarios = buildPilotoBenchmarkScenarios();
    const runs: Array<{ scenario: (typeof scenarios)[number]; models: ModelRun[] }> = [];

    console.log(`Piloto: ${tenant.name} (${tenant.id})`);
    console.log(`Modelo live actual: ${tenant.defaultAiModel}`);
    console.log(`FAQs: ${tenant.faqs.length} | escenarios: ${scenarios.length} | modelos: ${BENCHMARK_MODELS.length}`);

    for (const scenario of scenarios) {
      console.log(`\n== ${scenario.id} · ${scenario.title}`);
      const ragQuery = buildRetrievalQuery(scenario.userMessage, scenario.history);
      let ragContext = "";
      try {
        const hits = await ragService.retrieve(tenant.id, ragQuery);
        ragContext = ragService.formatContext(hits);
      } catch (error) {
        console.warn("RAG no disponible para este escenario:", error instanceof Error ? error.message : error);
      }

      const knowledge = [faqKnowledge, ragContext, scenario.extraKnowledge].filter(Boolean).join("\n\n");
      const systemPrompt = buildRuntimeSystemPrompt({
        businessName: tenant.name,
        botName: tenant.config.botName,
        botTone: tenant.config.botTone,
        knowledge,
        commonPhrases: ["Que deseas grabar?", "Asi es", "De nada! Buen dia!"],
        toneRules: {
          use_emojis: "moderate",
          response_length: "short",
          offer_next_step: true,
          avoid_long_explanations: true
        },
        customerMemory: scenario.customerMemory
      });

      const modelRuns: ModelRun[] = [];
      for (const model of BENCHMARK_MODELS) {
        process.stdout.write(`  ${model.id}... `);
        try {
          const result = await openAiService.respond({
            systemPrompt,
            userMessage: scenario.userMessage,
            model: model.id,
            history: scenario.history
          });
          const scored = scoreBenchmarkReply(result.text, scenario.score);
          const row: ModelRun = {
            model: model.id,
            label: model.label,
            reply: result.text,
            latencyMs: result.latencyMs,
            tokensInput: result.tokensInput,
            tokensOutput: result.tokensOutput,
            estimatedCostUsd: result.estimatedCost,
            passed: scored.passed,
            score: scored.score,
            matched: scored.matched,
            missed: scored.missed,
            forbiddenHits: scored.forbiddenHits
          };
          modelRuns.push(row);
          console.log(
            `${row.passed ? "PASS" : "FAIL"} ${row.latencyMs}ms $${row.estimatedCostUsd.toFixed(6)} · ${result.text.slice(0, 90).replace(/\s+/g, " ")}`
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          modelRuns.push({
            model: model.id,
            label: model.label,
            error: message,
            reply: "",
            latencyMs: 0,
            tokensInput: 0,
            tokensOutput: 0,
            estimatedCostUsd: 0,
            passed: false,
            score: 0,
            matched: [],
            missed: [message],
            forbiddenHits: []
          });
          console.log(`ERROR ${message}`);
        }
      }
      runs.push({ scenario, models: modelRuns });
    }

    const summary = BENCHMARK_MODELS.map((model) => {
      const rows = runs.flatMap((run) => run.models.filter((row) => row.model === model.id));
      const ok = rows.filter((row) => !row.error);
      const latencies = ok.map((row) => row.latencyMs).sort((a, b) => a - b);
      const p95 = latencies.length
        ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)]
        : 0;
      return {
        model: model.id,
        label: model.label,
        scenarios: rows.length,
        passed: rows.filter((row) => row.passed).length,
        passRate: rows.length ? rows.filter((row) => row.passed).length / rows.length : 0,
        errors: rows.filter((row) => row.error).length,
        avgScore: rows.length ? rows.reduce((sum, row) => sum + row.score, 0) / rows.length : 0,
        avgLatencyMs: ok.length ? Math.round(ok.reduce((sum, row) => sum + row.latencyMs, 0) / ok.length) : 0,
        p95LatencyMs: p95,
        totalCostUsd: rows.reduce((sum, row) => sum + row.estimatedCostUsd, 0),
        totalTokensIn: rows.reduce((sum, row) => sum + row.tokensInput, 0),
        totalTokensOut: rows.reduce((sum, row) => sum + row.tokensOutput, 0)
      };
    });

    const payload = {
      generatedAt: new Date().toISOString(),
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, liveModel: tenant.defaultAiModel },
      notes: [
        "Misma base de FAQs del piloto + historial/memoria sintética.",
        "GPT-5 corre con reasoning_effort=none para comparar latencia de WhatsApp.",
        "El bot live sigue en gpt-4o-mini; este script no cambia el modelo de producción."
      ],
      summary,
      runs: runs.map((run) => ({
        id: run.scenario.id,
        title: run.scenario.title,
        category: run.scenario.category,
        userMessage: run.scenario.userMessage,
        models: run.models
      }))
    };

    const outDir = path.join(root, "tmp");
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, "ai-model-benchmark-piloto.json");
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");
    console.log(`\nResumen:`);
    for (const row of summary) {
      console.log(
        `  ${row.model}: ${row.passed}/${row.scenarios} pass · score ${(row.avgScore * 100).toFixed(0)}% · ${row.avgLatencyMs}ms avg · $${row.totalCostUsd.toFixed(5)}`
      );
    }
    console.log(`\nResultados: ${outFile}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
