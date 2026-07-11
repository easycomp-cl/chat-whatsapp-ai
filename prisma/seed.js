import { PrismaClient, TenantStatus, ChannelType, KnowledgeSourceType, KnowledgeDocumentStatus } from "@prisma/client";
const prisma = new PrismaClient();
async function upsertTenant(seed) {
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
            const existing = await prisma.tenantDocument.findFirst({
                where: { tenantId: tenant.id, title: doc.title }
            });
            if (existing) {
                await prisma.tenantDocument.update({
                    where: { id: existing.id },
                    data: { rawText: doc.rawText, status: KnowledgeDocumentStatus.PENDING }
                });
            }
            else {
                await prisma.tenantDocument.create({
                    data: {
                        tenantId: tenant.id,
                        title: doc.title,
                        sourceType: KnowledgeSourceType.MANUAL,
                        rawText: doc.rawText,
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
                rawText: "Hallulla x6: Pan fresco del día, precio $1.800 CLP. Torta Tres Leches: Porción individual, precio $3.500 CLP."
            }
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
                title: "Servicios",
                rawText: "Corte Mujer: Incluye lavado y brushing, $18.000 CLP, 60 minutos. Balayage: Evaluación previa incluida, $69.000 CLP, 180 minutos."
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
                rawText: "Lavado exterior: Incluye llantas, $12.000 CLP, 45 minutos. Lavado full: Exterior, interior y cera rápida, $22.000 CLP, 90 minutos."
            }
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
