import { describe, expect, it } from "vitest";
import { normalizeWebhookEvents } from "../src/modules/channel/whatsapp.mapper.js";

describe("normalizeWebhookEvents", () => {
  it("normalizes text message with reply context", () => {
    const events = normalizeWebhookEvents({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123" },
                messages: [
                  {
                    id: "wamid.in",
                    from: "56911111111",
                    type: "text",
                    text: { body: "Sí, ese horario me sirve" },
                    context: { id: "wamid.parent", from: "56911111111" }
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "message",
      text: "Sí, ese horario me sirve",
      replyContext: { externalMessageId: "wamid.parent", fromPhone: "56911111111" }
    });
  });

  it("normalizes reaction add and remove", () => {
    const add = normalizeWebhookEvents({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123" },
                messages: [
                  {
                    id: "wamid.react",
                    from: "56911111111",
                    type: "reaction",
                    reaction: { message_id: "wamid.target", emoji: "👍" }
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    expect(add[0]).toMatchObject({
      kind: "reaction",
      emoji: "👍",
      targetMessageId: "wamid.target"
    });

    const remove = normalizeWebhookEvents({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123" },
                messages: [
                  {
                    id: "wamid.react2",
                    from: "56911111111",
                    type: "reaction",
                    reaction: { message_id: "wamid.target", emoji: "" }
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    expect(remove[0]).toMatchObject({ kind: "reaction", emoji: "" });
  });
});
