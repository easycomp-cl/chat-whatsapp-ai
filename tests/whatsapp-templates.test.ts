import { describe, expect, it } from "vitest";
import {
  STANDARD_TEMPLATE_PACK,
  buildCreateTemplatePayload,
  buildSendTemplateComponents,
  getStandardTemplate,
  renderTemplateBody
} from "../src/modules/whatsapp-templates/standard-template-pack.js";
import { mapMetaTemplateStatus } from "../src/modules/whatsapp-templates/whatsapp-templates.utils.js";
import { normalizeWebhookEvents } from "../src/modules/channel/whatsapp.mapper.js";

describe("standard template pack", () => {
  it("no deja variables al inicio o al final del cuerpo (regla Meta 2388299)", () => {
    for (const definition of STANDARD_TEMPLATE_PACK) {
      if (!definition.bodyText) continue;
      const text = definition.bodyText.trim();
      expect(text, definition.name).not.toMatch(/^\{\{\d+\}\}/);
      expect(text.replace(/[.!?…]+$/u, "").trim(), definition.name).not.toMatch(/\{\{\d+\}\}$/);
    }
  });

  it("incluye verificación, handoff, pago y muestra de producto", () => {
    const names = STANDARD_TEMPLATE_PACK.map((item) => item.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "verificar_responsable_es",
        "aviso_handoff_es",
        "link_pago_es",
        "muestra_producto_es",
        "reabrir_conversacion_es"
      ])
    );
  });

  it("arma payload UTILITY de confirmación de equipo con botón URL", () => {
    const definition = getStandardTemplate("verificar_responsable_es");
    expect(definition).toBeDefined();
    const payload = buildCreateTemplatePayload(definition!);
    expect(payload.category).toBe("UTILITY");
    expect(JSON.stringify(payload)).toContain("verify-phone");
    expect(JSON.stringify(payload)).toContain("Confirmar");
    expect(JSON.stringify(payload)).not.toContain("COPY_CODE");
  });

  it("arma payload UTILITY de pago con botón URL", () => {
    const definition = getStandardTemplate("link_pago_es");
    const payload = buildCreateTemplatePayload(definition!);
    expect(JSON.stringify(payload)).toContain("chatbotmanager.easycomp.cl/pay");
  });

  it("renderiza variables de cuerpo y componentes de envío", () => {
    const definition = getStandardTemplate("pedido_actualizacion_es");
    expect(renderTemplateBody(definition!.bodyText!, ["Juan", "#1042", "Enviado"])).toBe(
      "Hola Juan, tu pedido #1042 tiene el siguiente estado: Enviado. Si tienes dudas, responde este chat."
    );

    const components = buildSendTemplateComponents({
      definition: definition!,
      bodyParameters: ["Juan", "#1042", "Enviado"]
    });
    expect(components[0]).toMatchObject({
      type: "body",
      parameters: [
        { type: "text", text: "Juan" },
        { type: "text", text: "#1042" },
        { type: "text", text: "Enviado" }
      ]
    });
  });
});

describe("mapMetaTemplateStatus", () => {
  it("mapea estados de Meta a chips de Mis plantillas", () => {
    expect(mapMetaTemplateStatus("APPROVED")).toBe("APPROVED");
    expect(mapMetaTemplateStatus("REJECTED")).toBe("REJECTED");
    expect(mapMetaTemplateStatus("PAUSED")).toBe("PAUSED");
    expect(mapMetaTemplateStatus("DISABLED")).toBe("DISABLED");
    expect(mapMetaTemplateStatus("PENDING")).toBe("PENDING");
  });
});

describe("normalizeWebhookEvents template status", () => {
  it("normaliza message_template_status_update", () => {
    const events = normalizeWebhookEvents({
      entry: [
        {
          id: "WABA123",
          changes: [
            {
              field: "message_template_status_update",
              value: {
                event: "APPROVED",
                message_template_id: 998877,
                message_template_name: "seguimiento_asesor_es",
                message_template_language: "es",
                reason: "NONE"
              }
            }
          ]
        }
      ]
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "template_status",
      wabaId: "WABA123",
      name: "seguimiento_asesor_es",
      language: "es",
      event: "APPROVED",
      metaTemplateId: "998877",
      reason: "NONE"
    });
  });
});
