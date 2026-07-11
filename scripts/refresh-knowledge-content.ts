import { readFileSync } from "node:fs";
import path from "node:path";
import { KnowledgeDocumentStatus, KnowledgeSourceType, PrismaClient } from "@prisma/client";
import { knowledgeIndexerService } from "../src/modules/knowledge/knowledge-indexer.service.js";

const prisma = new PrismaClient();

const PANADERIA_KNOWLEDGE_TITLES: Record<string, string> = {
  "politicas-panaderia-sol.txt": "Políticas del negocio",
  "despacho-y-retiro.txt": "Despacho, zonas y retiro en local",
  "encargos-tortas.txt": "Encargos y tortas personalizadas",
  "sobre-panaderia-sol.txt": "Sobre Panadería Sol"
};

function textByteSize(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function loadPanaderiaFixtures(): Array<{ title: string; rawText: string }> {
  const fixturesDir = path.resolve("scripts/fixtures/knowledge");
  return Object.keys(PANADERIA_KNOWLEDGE_TITLES)
    .map((file) => ({
      title: PANADERIA_KNOWLEDGE_TITLES[file],
      rawText: readFileSync(path.join(fixturesDir, file), "utf8").trim()
    }))
    .filter((doc) => doc.rawText.length > 0);
}

const TWD_KNOWLEDGE_TITLES: Record<string, string> = {
  "sobre-the-wood-club.txt": "Sobre The Wood Club",
  "politicas-twd.txt": "Políticas del negocio",
  "tablas-personalizadas.txt": "Tablas personalizadas",
  "despacho-y-retiro-twd.txt": "Despacho y retiro en taller"
};

function loadTwdFixtures(): Array<{ title: string; rawText: string }> {
  const fixturesDir = path.resolve("scripts/fixtures/knowledge/twd");
  return Object.keys(TWD_KNOWLEDGE_TITLES)
    .map((file) => ({
      title: TWD_KNOWLEDGE_TITLES[file],
      rawText: readFileSync(path.join(fixturesDir, file), "utf8").trim()
    }))
    .filter((doc) => doc.rawText.length > 0);
}

const TENANT_KNOWLEDGE: Record<string, Array<{ title: string; rawText: string }>> = {
  "tenant-panaderia-sol": [
    {
      title: "Catálogo de productos",
      rawText:
        "Hallulla x6: Pan fresco del día, precio $1.800 CLP. Marraqueta x6: $1.600 CLP. Torta Tres Leches porción: $3.500 CLP. Empanada de pino: $2.200 CLP. Kuchen de manzana porción: $2.800 CLP."
    },
    ...loadPanaderiaFixtures()
  ],
  "tenant-estudio-brava": [
    {
      title: "Servicios y precios",
      rawText:
        "Corte Mujer: Incluye lavado y brushing, $18.000 CLP, 60 minutos. Balayage: Evaluación previa incluida, $69.000 CLP, 180 minutos. Manicure permanente: $15.000 CLP, 45 minutos. Depilación cejas: $6.500 CLP, 20 minutos."
    },
    {
      title: "Políticas del salón",
      rawText:
        "Reservas: Trabajamos con agenda previa por WhatsApp. Cancelaciones: Avisar con al menos 24 horas; después de ese plazo puede aplicarse cargo del 50% del servicio. Atrasos: Tolerancia de 10 minutos; después el turno puede reprogramarse. Medios de pago: Transferencia, débito y crédito. Ubicación: Av. Apoquindo 3456, Las Condes, local 12."
    },
    {
      title: "Cuidados post servicio",
      rawText:
        "Coloración: Evitar lavar el cabello las primeras 48 horas. Balayage: Usar shampoo sin sulfatos recomendado en salón. Uñas permanentes: Evitar exponerlas a acetona en las primeras 24 horas."
    }
  ],
  "tenant-lava-pro": [
    {
      title: "Servicios de lavado",
      rawText:
        "Lavado exterior: Incluye llantas, $12.000 CLP, 45 minutos. Lavado full: Exterior, interior y cera rápida, $22.000 CLP, 90 minutos. Lavado premium: Full + aspirado profundo y aromatizante, $28.000 CLP, 120 minutos."
    },
    {
      title: "Despacho a domicilio",
      rawText:
        "Cobertura: Providencia, Ñuñoa, Las Condes y La Reina. Horario: Lunes a sábado de 9:00 a 18:00. Pedido mínimo: $25.000 CLP. Tarifa despacho: $4.000 CLP fijos dentro de zona. Se requiere estacionamiento disponible y punto de agua."
    },
    {
      title: "Políticas Lava Pro",
      rawText:
        "No nos hacemos responsables por objetos de valor dentro del vehículo. Retiro de vehículos con más de 30 minutos de atraso puede tener recargo de $3.000 CLP. Garantía: Si no quedas conforme con el lavado exterior, revisamos en el momento antes de que te vayas."
    }
  ],
  "tenant-twd": [
    {
      title: "Catálogo de productos",
      rawText:
        "Tabla cocina roble 40x30 cm: $45.000 CLP. Tabla cocina roble 50x35 cm: $58.000 CLP. Tabla parrilla lingue 45x30 cm: $52.000 CLP. Tabla servir rauli 35x25 cm: $38.000 CLP. Escritorio nogal 120x60 cm: $185.000 CLP. Repisa flotante roble 80 cm: $42.000 CLP. Grabado láser logo: desde $8.000 CLP."
    },
    ...loadTwdFixtures()
  ]
};

async function upsertKnowledgeDoc(tenantId: string, doc: { title: string; rawText: string }) {
  const rawText = doc.rawText.trim();
  if (!rawText) return;

  const fileSize = textByteSize(rawText);
  const existing = await prisma.tenantDocument.findFirst({
    where: { tenantId, title: doc.title }
  });

  const record = existing
    ? await prisma.tenantDocument.update({
        where: { id: existing.id },
        data: {
          rawText,
          fileSize,
          status: KnowledgeDocumentStatus.PENDING,
          indexError: null
        }
      })
    : await prisma.tenantDocument.create({
        data: {
          tenantId,
          title: doc.title,
          sourceType: KnowledgeSourceType.MANUAL,
          rawText,
          fileSize,
          status: KnowledgeDocumentStatus.PENDING
        }
      });

  const result = await knowledgeIndexerService.indexDocument(record.id);
  console.log(`✓ ${tenantId} / ${doc.title} → ${result.chunksIndexed} chunks`);
}

async function main() {
  for (const [tenantId, docs] of Object.entries(TENANT_KNOWLEDGE)) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      console.warn(`Tenant no encontrado: ${tenantId}`);
      continue;
    }
    for (const doc of docs) {
      await upsertKnowledgeDoc(tenantId, doc);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
