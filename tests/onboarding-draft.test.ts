import { describe, expect, it } from "vitest";
import { onboardingPatchSchema } from "../src/modules/onboarding/onboarding.schema.js";
import {
  buildSetupStatus,
  computeChecklist,
  mergeOnboardingDraft
} from "../src/modules/onboarding/setup-status.service.js";
import { isScheduleParseable } from "../src/modules/onboarding/schedule.js";

describe("onboardingPatchSchema (borrador parcial)", () => {
  it("acepta identity solo con business_name corto", () => {
    const parsed = onboardingPatchSchema.parse({
      identity: { business_name: "Aurora" }
    });
    expect(parsed.identity?.business_name).toBe("Aurora");
  });

  it("acepta offerings incompletos", () => {
    const parsed = onboardingPatchSchema.parse({
      offerings: [{ type: "product", name: "Pan", description: "corto" }]
    });
    expect(parsed.offerings?.[0]?.description).toBe("corto");
  });

  it("acepta current_step 1-5", () => {
    expect(onboardingPatchSchema.parse({ current_step: 4 }).current_step).toBe(4);
  });

  it("rechaza current_step fuera de 1-5", () => {
    expect(() => onboardingPatchSchema.parse({ current_step: 6 })).toThrow();
    expect(() => onboardingPatchSchema.parse({ current_step: 0 })).toThrow();
  });

  it("rechaza business_type desconocido", () => {
    expect(() =>
      onboardingPatchSchema.parse({ identity: { business_type: "retail" } })
    ).toThrow();
  });

  it("ignora claves desconocidas", () => {
    const parsed = onboardingPatchSchema.parse({
      identity: { business_name: "Aurora" },
      extra_field: true
    });
    expect(parsed).toEqual({ identity: { business_name: "Aurora" } });
  });
});

describe("mergeOnboardingDraft", () => {
  it("hace merge de identity y no replace ciego", () => {
    const merged = mergeOnboardingDraft(
      { identity: { business_name: "Aurora" } },
      { identity: { description: "Panadería artesanal en Santiago con horneado diario." } }
    );
    expect(merged.identity?.business_name).toBe("Aurora");
    expect(merged.identity?.description).toContain("Panadería");
  });

  it("reemplaza el array de offerings completo", () => {
    const merged = mergeOnboardingDraft(
      { offerings: [{ name: "Pan", description: "Uno" }] },
      { offerings: [{ name: "Empanada", description: "Dos" }] }
    );
    expect(merged.offerings).toEqual([{ name: "Empanada", description: "Dos" }]);
  });

  it("ignora logo_url que no sea https", () => {
    const merged = mergeOnboardingDraft(
      { identity: { business_name: "Aurora", logo_url: "https://cdn.example.com/logo.png" } },
      { identity: { logo_url: "data:image/png;base64,aaaa" } }
    );
    expect(merged.identity?.logo_url).toBe("https://cdn.example.com/logo.png");
  });

  it("persiste logo_url https", () => {
    const merged = mergeOnboardingDraft(
      { identity: { business_name: "Aurora" } },
      { identity: { logo_url: "https://cdn.example.com/tenants/abc/logo.png" } }
    );
    expect(merged.identity?.logo_url).toBe("https://cdn.example.com/tenants/abc/logo.png");
  });

  it("borra logo_url con null", () => {
    const merged = mergeOnboardingDraft(
      { identity: { logo_url: "https://cdn.example.com/logo.png" } },
      { identity: { logo_url: null } }
    );
    expect(merged.identity?.logo_url).toBeNull();
  });

  it("ignora blob: en logo_url", () => {
    const merged = mergeOnboardingDraft(
      { identity: { business_name: "Aurora" } },
      { identity: { logo_url: "blob:https://localhost/abc" } }
    );
    expect(merged.identity?.logo_url).toBeUndefined();
  });
});

describe("checklist vs complete", () => {
  it("identity.done es false si solo hay nombre", () => {
    const checklist = computeChecklist({
      draft: { identity: { business_name: "Aurora" } },
      hasActiveWhatsappChannel: false,
      hasPrimaryAdmin: false
    });
    expect(checklist.identity).toBe(false);
  });

  it("offerings incompletos no marcan done", () => {
    const checklist = computeChecklist({
      draft: { offerings: [{ name: "Pan", description: "corto" }] },
      hasActiveWhatsappChannel: false,
      hasPrimaryAdmin: false
    });
    expect(checklist.offerings).toBe(false);
  });

  it("identity.done exige nombre, tipo y descripción 50-1000", () => {
    const checklist = computeChecklist({
      draft: {
        identity: {
          business_name: "Aurora",
          business_type: "products",
          description: "Panadería artesanal en Santiago con productos horneados todos los días."
        }
      },
      hasActiveWhatsappChannel: false,
      hasPrimaryAdmin: false
    });
    expect(checklist.identity).toBe(true);
  });

  it("bot_identity exige saludo >= 10 y nombre si use_named_agent", () => {
    expect(
      computeChecklist({
        draft: { bot_identity: { use_named_agent: true, greeting_message: "Hola, soy Sol." } },
        hasActiveWhatsappChannel: false
      }).bot_identity
    ).toBe(false);

    expect(
      computeChecklist({
        draft: {
          bot_identity: {
            use_named_agent: false,
            greeting_message: "Hola, ¿en qué te ayudo?"
          }
        },
        hasActiveWhatsappChannel: false,
        tenantBotName: "Sol"
      }).bot_identity
    ).toBe(true);
  });

  it("human_contact exige nombre y E.164, no un admin existente", () => {
    expect(
      computeChecklist({
        draft: {},
        hasActiveWhatsappChannel: false,
        hasPrimaryAdmin: true
      }).human_contact
    ).toBe(false);

    expect(
      computeChecklist({
        draft: { human_contact: { admin_name: "María", admin_phone: "+56912345678" } },
        hasActiveWhatsappChannel: false,
        hasPrimaryAdmin: false
      }).human_contact
    ).toBe(true);
  });
});

describe("setup-status shape", () => {
  it("devuelve current_step, draft_updated_at y draft objeto", () => {
    const checklist = computeChecklist({
      draft: { identity: { business_name: "Aurora" } },
      hasActiveWhatsappChannel: false
    });
    const status = buildSetupStatus({
      setup: {
        version: 1,
        started_at: new Date().toISOString(),
        current_step: 4,
        draft_updated_at: "2026-09-17T22:15:00.000Z",
        draft: { identity: { business_name: "Aurora" } },
        checklist: {}
      },
      checklist,
      botGlobalEnabled: false,
      allowGoLiveWithoutChannel: true,
      currentStep: 4,
      draftUpdatedAt: "2026-09-17T22:15:00.000Z"
    });
    expect(status.current_step).toBe(4);
    expect(status.draft_updated_at).toBe("2026-09-17T22:15:00.000Z");
    expect(status.draft).toEqual({ identity: { business_name: "Aurora" } });
    expect(status.checklist.identity.done).toBe(false);
    expect(status.progress_percent === 100 || status.progress_percent < 40).toBe(true);
  });

  it("no sube el progreso por un PATCH incompleto", () => {
    const before = computeChecklist({
      draft: {},
      hasActiveWhatsappChannel: false
    });
    const after = computeChecklist({
      draft: { identity: { business_name: "Aurora" } },
      hasActiveWhatsappChannel: false
    });
    expect(before.identity).toBe(false);
    expect(after.identity).toBe(false);
  });
});

describe("isScheduleParseable", () => {
  it("acepta horario del wizard y texto legado", () => {
    expect(isScheduleParseable("Lun–Vie 08:00–18:00")).toBe(true);
    expect(isScheduleParseable("Lun–Vie 8:00–20:00, Sáb 9:00–14:00")).toBe(true);
    expect(isScheduleParseable("todavía corta")).toBe(false);
    expect(isScheduleParseable("")).toBe(false);
  });
});
