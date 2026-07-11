import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PrismaClient,
  TenantStatus,
  ChannelType,
  KnowledgeSourceType,
  KnowledgeDocumentStatus
} from "@prisma/client";

const prisma = new PrismaClient();

const PANADERIA_KNOWLEDGE_TITLES: Record<string, string> = {
  "politicas-panaderia-sol.txt": "Políticas del negocio",
  "despacho-y-retiro.txt": "Despacho, zonas y retiro en local",
  "encargos-tortas.txt": "Encargos y tortas personalizadas",
  "sobre-panaderia-sol.txt": "Sobre Panadería Sol"
};

function loadPanaderiaKnowledgeFixtures(): Array<{ title: string; rawText: string }> {
  const fixturesDir = path.resolve("scripts/fixtures/knowledge");
  return Object.keys(PANADERIA_KNOWLEDGE_TITLES)
    .map((file) => {
      const rawText = readFileSync(path.join(fixturesDir, file), "utf8").trim();
      return {
        title: PANADERIA_KNOWLEDGE_TITLES[file],
        rawText
      };
    })
    .filter((doc) => doc.rawText.length > 0);
}

const TWD_KNOWLEDGE_TITLES: Record<string, string> = {
  "sobre-the-wood-club.txt": "Sobre The Wood Club",
  "politicas-twd.txt": "Políticas del negocio",
  "tablas-personalizadas.txt": "Tablas personalizadas",
  "despacho-y-retiro-twd.txt": "Despacho y retiro en taller"
};

function loadTwdKnowledgeFixtures(): Array<{ title: string; rawText: string }> {
  const fixturesDir = path.resolve("scripts/fixtures/knowledge/twd");
  return Object.keys(TWD_KNOWLEDGE_TITLES)
    .map((file) => {
      const rawText = readFileSync(path.join(fixturesDir, file), "utf8").trim();
      return {
        title: TWD_KNOWLEDGE_TITLES[file],
        rawText
      };
    })
    .filter((doc) => doc.rawText.length > 0);
}

function textByteSize(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

async function upsertTenant(seed: {
  slug: string;
  name: string;
  businessType: string;
  businessPhone: string;
  phoneNumberId: string;
  adminName: string;
  adminPhone: string;
  botName: string;
  botTone: string;
  faqs: Array<{ question: string; answer: string; category?: string; priority?: number }>;
  knowledgeDocs?: Array<{ title: string; rawText: string }>;
}) {
  const tenant = await prisma.tenant.upsert({
    where: { slug: seed.slug },
    update: {
      name: seed.name,
      businessType: seed.businessType,
      status: TenantStatus.ACTIVE,
      botGlobalEnabled: true,
      confidenceThreshold: 0.7,
      defaultAiModel: "gpt-4o-mini"
    },
    create: {
      id: seed.slug,
      slug: seed.slug,
      name: seed.name,
      businessType: seed.businessType,
      status: TenantStatus.ACTIVE,
      botGlobalEnabled: true,
      confidenceThreshold: 0.7,
      defaultAiModel: "gpt-4o-mini"
    }
  });

  const existingChannel = await prisma.tenantChannel.findFirst({
    where: { tenantId: tenant.id, channelType: ChannelType.WHATSAPP_BUSINESS }
  });

  if (existingChannel) {
    await prisma.tenantChannel.update({
      where: { id: existingChannel.id },
      data: {
        isActive: true,
        status: "ACTIVE"
      }
    });
  } else {
    await prisma.tenantChannel.upsert({
      where: { phoneNumberId: seed.phoneNumberId },
      update: {
        phoneNumber: seed.businessPhone,
        isActive: true,
        status: "ACTIVE"
      },
      create: {
        tenantId: tenant.id,
        channelType: ChannelType.WHATSAPP_BUSINESS,
        phoneNumber: seed.businessPhone,
        phoneNumberId: seed.phoneNumberId,
        status: "ACTIVE"
      }
    });
  }

  await prisma.tenantAdmin.upsert({
    where: {
      tenantId_phoneNumber: {
        tenantId: tenant.id,
        phoneNumber: seed.adminPhone
      }
    },
    update: {
      name: seed.adminName,
      isPrimary: true,
      notifyOnHandoff: true
    },
    create: {
      tenantId: tenant.id,
      name: seed.adminName,
      phoneNumber: seed.adminPhone,
      isPrimary: true,
      notifyOnHandoff: true
    }
  });

  await prisma.tenantConfig.upsert({
    where: { tenantId: tenant.id },
    update: {
      botName: seed.botName,
      botTone: seed.botTone,
      greetingMessage: `Hola, soy ${seed.botName} de ${seed.name}.`,
      fallbackMessage: "No tengo esa información confirmada todavía.",
      handoffMessage: "Déjame revisarlo con un asesor y te respondemos en breve.",
      outOfHoursMessage: "Estamos fuera de horario, pero ya dejamos tu mensaje registrado."
    },
    create: {
      tenantId: tenant.id,
      botName: seed.botName,
      botTone: seed.botTone,
      greetingMessage: `Hola, soy ${seed.botName} de ${seed.name}.`,
      fallbackMessage: "No tengo esa información confirmada todavía.",
      handoffMessage: "Déjame revisarlo con un asesor y te respondemos en breve.",
      outOfHoursMessage: "Estamos fuera de horario, pero ya dejamos tu mensaje registrado."
    }
  });

  await prisma.tenantFaq.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.tenantFaq.createMany({
    data: seed.faqs.map((faq, index) => ({
      tenantId: tenant.id,
      question: faq.question,
      answer: faq.answer,
      category: faq.category ?? "general",
      priority: faq.priority ?? index,
      isActive: true
    }))
  });

  if (seed.knowledgeDocs?.length) {
    for (const doc of seed.knowledgeDocs) {
      const rawText = doc.rawText.trim();
      if (!rawText) {
        continue;
      }
      const fileSize = textByteSize(rawText);
      const existing = await prisma.tenantDocument.findFirst({
        where: { tenantId: tenant.id, title: doc.title }
      });
      if (existing) {
        await prisma.tenantDocument.update({
          where: { id: existing.id },
          data: {
            rawText,
            fileSize,
            status: KnowledgeDocumentStatus.PENDING,
            indexError: null
          }
        });
      } else {
        await prisma.tenantDocument.create({
          data: {
            tenantId: tenant.id,
            title: doc.title,
            sourceType: KnowledgeSourceType.MANUAL,
            rawText,
            fileSize,
            status: KnowledgeDocumentStatus.PENDING
          }
        });
      }
    }
  }
}

async function main() {
  await upsertTenant({
    slug: "tenant-panaderia-sol",
    name: "Panadería Sol",
    businessType: "bakery",
    businessPhone: "+56970000001",
    phoneNumberId: "business-phone-id-1",
    adminName: "María López",
    adminPhone: "+56981111111",
    botName: "Solecito",
    botTone: "cercano y eficiente",
    faqs: [
      { question: "¿Cuál es el horario?", answer: "Lunes a sábado de 07:30 a 20:00.", priority: 10 },
      { question: "¿Hacen despacho?", answer: "Sí, dentro de la comuna con costo adicional.", priority: 5 }
    ],
    knowledgeDocs: [
      {
        title: "Catálogo de productos",
        rawText:
          "Hallulla x6: Pan fresco del día, precio $1.800 CLP. Marraqueta x6: $1.600 CLP. Torta Tres Leches porción: $3.500 CLP. Empanada de pino: $2.200 CLP. Kuchen de manzana porción: $2.800 CLP."
      },
      ...loadPanaderiaKnowledgeFixtures()
    ]
  });

  await upsertTenant({
    slug: "tenant-estudio-brava",
    name: "Estudio Brava",
    businessType: "beauty_salon",
    businessPhone: "+56970000002",
    phoneNumberId: "business-phone-id-2",
    adminName: "Camila Rojas",
    adminPhone: "+56982222222",
    botName: "BravaBot",
    botTone: "sofisticado y cálido",
    faqs: [
      { question: "¿Atienden con reserva?", answer: "Sí, trabajamos principalmente con agenda previa.", priority: 10 },
      { question: "¿Qué medios de pago aceptan?", answer: "Transferencia, débito y crédito.", priority: 5 }
    ],
    knowledgeDocs: [
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
    ]
  });

  await upsertTenant({
    slug: "tenant-lava-pro",
    name: "Lava Pro",
    businessType: "car_wash",
    businessPhone: "+56970000003",
    phoneNumberId: "business-phone-id-3",
    adminName: "Felipe Soto",
    adminPhone: "+56983333333",
    botName: "LavaPro IA",
    botTone: "rápido y resolutivo",
    faqs: [
      { question: "¿Trabajan a domicilio?", answer: "Sí, coordinamos servicio a domicilio en ciertas zonas.", priority: 10 },
      { question: "¿Cuánto demora el lavado full?", answer: "Aproximadamente 90 minutos.", priority: 5 }
    ],
    knowledgeDocs: [
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
    ]
  });

  await upsertTenant({
    slug: "tenant-twd",
    name: "The Wood Club (TWD)",
    businessType: "woodworking",
    businessPhone: "+56970000004",
    phoneNumberId: "business-phone-id-4",
    adminName: "Felipe Muñoz",
    adminPhone: "+56984444444",
    botName: "Woody",
    botTone: "profesional, cálido y experto en maderas",
    faqs: [
      {
        question: "¿Hacen tablas a medida?",
        answer:
          "Sí, las tablas personalizadas son nuestro producto estrella. Indícanos medidas, tipo de madera y uso (cocina, parrilla, servir) y te cotizamos.",
        priority: 10
      },
      {
        question: "¿Qué tipos de madera trabajan?",
        answer:
          "Roble nacional, lingue, raulí, nogal importado y encino europeo según stock. Para cocina recomendamos roble o lingue; para servir, raulí.",
        priority: 9
      },
      {
        question: "¿Cuánto demora un pedido personalizado?",
        answer:
          "Una tabla estándar demora entre 5 y 7 días hábiles. Piezas a medida con acabado especial: 8 a 12 días hábiles.",
        priority: 8
      },
      {
        question: "¿Hacen despacho?",
        answer:
          "Sí, despachamos en Región Metropolitana desde $4.500 CLP y a regiones por Starken o Chilexpress. También puedes retirar en nuestro taller en Las Condes.",
        priority: 7
      },
      {
        question: "¿Cuál es el horario del showroom?",
        answer: "Lunes a viernes de 9:30 a 18:30 y sábados de 10:00 a 14:00 en Av. Las Condes 11200, local 4.",
        priority: 6
      }
    ],
    knowledgeDocs: [
      {
        title: "Catálogo de productos",
        rawText:
          "Tabla cocina roble 40x30 cm: $45.000 CLP. Tabla cocina roble 50x35 cm: $58.000 CLP. Tabla parrilla lingue 45x30 cm: $52.000 CLP. Tabla servir rauli 35x25 cm: $38.000 CLP. Escritorio nogal 120x60 cm: $185.000 CLP. Repisa flotante roble 80 cm: $42.000 CLP. Grabado láser logo: desde $8.000 CLP."
      },
      ...loadTwdKnowledgeFixtures()
    ]
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
