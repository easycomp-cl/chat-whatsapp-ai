import { describe, expect, it } from "vitest";
import { normalizeWebhookEvents } from "../src/modules/channel/whatsapp.mapper.js";
import {
  buildChoiceInteractiveMessage,
  outboundInteractiveSchema,
  slugInteractiveId
} from "../src/utils/whatsapp-interactive.js";

describe("whatsapp interactive inbound", () => {
  it("normalizes button_reply selections", () => {
    const events = normalizeWebhookEvents({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123" },
                messages: [
                  {
                    id: "wamid.interactive-btn",
                    from: "56911111111",
                    type: "interactive",
                    interactive: {
                      type: "button_reply",
                      button_reply: { id: "opt_delivery", title: "Despacho" }
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    expect(events[0]).toMatchObject({
      kind: "message",
      text: "Despacho",
      interactiveSelection: {
        id: "opt_delivery",
        title: "Despacho",
        type: "button"
      }
    });
  });

  it("normalizes list_reply selections", () => {
    const events = normalizeWebhookEvents({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123" },
                messages: [
                  {
                    id: "wamid.interactive-list",
                    from: "56911111111",
                    type: "interactive",
                    interactive: {
                      type: "list_reply",
                      list_reply: {
                        id: "pickup",
                        title: "Retiro en tienda",
                        description: "Gratis"
                      }
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    expect(events[0]).toMatchObject({
      kind: "message",
      text: "Retiro en tienda",
      interactiveSelection: { id: "pickup", title: "Retiro en tienda", type: "list" }
    });
  });
});

describe("buildChoiceInteractiveMessage", () => {
  it("builds buttons for up to three options", () => {
    const interactive = buildChoiceInteractiveMessage({
      body: "¿Cómo prefieres recibirlo?",
      options: [
        { value: "delivery", label: "Despacho" },
        { value: "pickup", label: "Retiro" }
      ]
    });

    expect(interactive).toMatchObject({
      type: "button",
      body: "¿Cómo prefieres recibirlo?",
      buttons: [
        { id: slugInteractiveId("delivery", 0), title: "Despacho" },
        { id: slugInteractiveId("pickup", 1), title: "Retiro" }
      ]
    });
  });

  it("builds list for four to ten options", () => {
    const interactive = buildChoiceInteractiveMessage({
      body: "Elige comuna",
      options: [
        { value: "providencia", label: "Providencia" },
        { value: "nunoa", label: "Ñuñoa" },
        { value: "la_reina", label: "La Reina" },
        { value: "macul", label: "Macul" }
      ]
    });

    expect(interactive?.type).toBe("list");
    expect(interactive && interactive.type === "list" ? interactive.sections[0]?.rows.length : 0).toBe(4);
  });
});

describe("outboundInteractiveSchema", () => {
  it("accepts valid button payloads", () => {
    const result = outboundInteractiveSchema.safeParse({
      type: "button",
      body: "¿Cómo prefieres recibir tu pedido?",
      buttons: [
        { id: "delivery", title: "Despacho" },
        { id: "pickup", title: "Retiro" }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("accepts valid list payloads", () => {
    const result = outboundInteractiveSchema.safeParse({
      type: "list",
      body: "Elige horario",
      buttonText: "Ver opciones",
      sections: [
        {
          title: "Horarios",
          rows: [{ id: "morning", title: "Mañana", description: "09:00" }]
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("rejects lists with more than ten rows", () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({
      id: `row_${index}`,
      title: `Opción ${index + 1}`
    }));

    const result = outboundInteractiveSchema.safeParse({
      type: "list",
      body: "Elige",
      buttonText: "Ver",
      sections: [{ rows }]
    });

    expect(result.success).toBe(false);
  });
});
