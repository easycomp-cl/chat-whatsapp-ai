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

  it("normalizes customer message edit", () => {
    const events = normalizeWebhookEvents({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123" },
                contacts: [{ profile: { name: "Juan" } }],
                messages: [
                  {
                    id: "wamid.edit-event",
                    from: "56911111111",
                    type: "edit",
                    edit: {
                      original_message_id: "wamid.original",
                      message: {
                        type: "text",
                        text: { body: "Texto corregido por el usuario" }
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

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "edit",
      externalMessageId: "wamid.edit-event",
      originalMessageId: "wamid.original",
      text: "Texto corregido por el usuario",
      fromName: "Juan"
    });
  });

  it("normalizes customer message revoke", () => {
    const events = normalizeWebhookEvents({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123" },
                messages: [
                  {
                    id: "wamid.revoke-event",
                    from: "56911111111",
                    type: "revoke",
                    revoke: { original_message_id: "wamid.original" }
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    expect(events[0]).toMatchObject({
      kind: "revoke",
      originalMessageId: "wamid.original"
    });
  });

  it("normalizes inbound image and document messages", () => {
    const imageEvents = normalizeWebhookEvents({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123" },
                messages: [
                  {
                    id: "wamid.img",
                    from: "56911111111",
                    type: "image",
                    image: {
                      id: "media-img-1",
                      mime_type: "image/jpeg",
                      caption: "Foto del producto"
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    expect(imageEvents[0]).toMatchObject({
      kind: "message",
      text: "Foto del producto",
      media: {
        type: "image",
        mediaId: "media-img-1",
        mimeType: "image/jpeg",
        caption: "Foto del producto"
      }
    });

    const docEvents = normalizeWebhookEvents({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123" },
                messages: [
                  {
                    id: "wamid.doc",
                    from: "56911111111",
                    type: "document",
                    document: {
                      id: "media-doc-1",
                      mime_type: "application/pdf",
                      filename: "factura.pdf"
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    expect(docEvents[0]).toMatchObject({
      kind: "message",
      text: "factura.pdf",
      media: {
        type: "document",
        mediaId: "media-doc-1",
        mimeType: "application/pdf",
        filename: "factura.pdf"
      }
    });
  });

  it("normalizes inbound audio and voice messages", () => {
    const audioEvents = normalizeWebhookEvents({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123" },
                messages: [
                  {
                    id: "wamid.audio",
                    from: "56911111111",
                    type: "audio",
                    audio: {
                      id: "media-audio-1",
                      mime_type: "audio/ogg; codecs=opus"
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    expect(audioEvents[0]).toMatchObject({
      kind: "message",
      text: "[Audio]",
      media: {
        type: "audio",
        mediaId: "media-audio-1",
        mimeType: "audio/ogg; codecs=opus"
      }
    });

    const voiceEvents = normalizeWebhookEvents({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123" },
                messages: [
                  {
                    id: "wamid.voice",
                    from: "56911111111",
                    type: "voice",
                    audio: {
                      id: "media-voice-1",
                      mime_type: "audio/ogg; codecs=opus"
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    expect(voiceEvents[0]).toMatchObject({
      kind: "message",
      text: "[Audio]",
      media: {
        type: "audio",
        mediaId: "media-voice-1",
        voice: true
      }
    });
  });

  it("normalizes outbound delivery status webhooks", () => {
    const events = normalizeWebhookEvents({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123" },
                statuses: [
                  {
                    id: "wamid.outbound",
                    status: "delivered",
                    timestamp: "1717888800",
                    recipient_id: "56911111111"
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
      kind: "status",
      externalMessageId: "wamid.outbound",
      status: "delivered",
      recipientPhone: "56911111111"
    });
  });
});
