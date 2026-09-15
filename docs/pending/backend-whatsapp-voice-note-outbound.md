# Backend — Enviar notas de voz nativas (no audio genérico)

## Problema visible en WhatsApp del cliente

| Origen | Cómo se ve en WhatsApp |
|--------|------------------------|
| Cliente envía nota de voz (PTT) | Burbuja verde con waveform, icono micrófono, estilo nativo |
| Negocio responde con audio del dashboard | Burbuja gris con icono auriculares/archivo, reproductor “audio normal” |

La UI del dashboard **no controla** cómo se renderiza en la app de WhatsApp del cliente. Eso lo define la **Cloud API de Meta** al enviar el mensaje.

## Causa

El backend hoy envía mensajes salientes como **`type: audio`** sin el flag de nota de voz. Meta entrega un **archivo de audio** genérico.

Para nota de voz nativa hace falta:

```json
{
  "type": "audio",
  "audio": {
    "id": "<MEDIA_ID>",
    "voice": true
  }
}
```

Referencia: [Meta — Audio messages](https://developers.facebook.com/docs/whatsapp/cloud-api/messages/audio-messages/)

## Requisitos Meta para `voice: true`

| Requisito | Detalle |
|-----------|---------|
| Formato | **`audio/ogg` con codec OPUS** (obligatorio para voice note nativo) |
| Flag | `"voice": true` en el objeto `audio` |
| Otros formatos (MP3, WEBM, M4A…) | Se envían como audio normal aunque se pase `voice: true` |

## Cambios sugeridos en `chat-whatsapp-ai`

| Archivo | Cambio |
|---------|--------|
| `src/modules/channel/whatsapp.client.ts` → `sendAudioMessage` | Añadir `voice: true` cuando el envío sea nota de voz (asesor desde dashboard o bot) |
| `src/modules/conversations/message-media.utils.ts` | Detectar si el archivo es OGG Opus; si es WEBM/MP3, convertir a OGG Opus antes de subir a Meta **o** documentar que solo OGG Opus sale como PTT |
| `POST /conversations/:id/messages/media` | Opcional: query/body `as_voice_note=true` (default `true` para grabaciones del micrófono) |

### Conversión (si el navegador manda WEBM)

El micrófono del dashboard suele grabar `audio/webm;codecs=opus` (Chrome) u `audio/ogg;codecs=opus` (Firefox). Solo el segundo califica directo para Meta.

Opciones backend:

1. **ffmpeg** en worker: WEBM → OGG Opus antes de `sendAudioMessage`
2. Rechazar formatos no-OGG para PTT y pedir conversión en UI (peor UX)

## UI (`chat-whatsapp-ai-ui`)

- Ya prioriza grabación en `audio/ogg;codecs=opus` cuando el navegador lo soporta.
- Sigue enviando el archivo por `POST .../messages/media`; **no hay cambio de contrato** salvo el flag opcional arriba.
- El dashboard seguirá mostrando `<audio controls>`; el cambio visual es **solo en WhatsApp del cliente**.

## Cómo probar

1. Backend desplegado con `voice: true` + OGG Opus.
2. Desde dashboard: grabar nota de voz y enviar.
3. En el celular del cliente: debe verse como nota de voz (waveform), no como archivo con auriculares.
4. Adjuntar un MP3 manual: puede seguir viéndose como audio normal (esperado).

## Fuera de alcance

- Hacer que un MP3 adjunto se vea como PTT (Meta no lo permite).
- Cambiar cómo WhatsApp muestra mensajes **entrantes** (ya son PTT nativos del cliente).
