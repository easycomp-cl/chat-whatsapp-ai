### main.py
from fastapi import FastAPI, Request
from dotenv import load_dotenv
from services.bot_logic import generate_response
from services.whatsapp_api import send_whatsapp_message
from fastapi.responses import PlainTextResponse

import os
import json

load_dotenv()
print("🔐 VERIFY_TOKEN cargado:", os.getenv("VERIFY_TOKEN"))  # debug
app = FastAPI()


@app.get("/webhook")
def verify_webhook(request: Request):
    params = request.query_params
    mode = params.get("hub.mode")
    challenge = params.get("hub.challenge")
    verify_token = params.get("hub.verify_token")

    if mode == "subscribe" and verify_token == os.getenv("VERIFY_TOKEN"):
        return PlainTextResponse(content=challenge, status_code=200)
    else:
        return PlainTextResponse(content="Invalid verification", status_code=403)

@app.post("/webhook")
async def receive_message(req: Request):
    body = await req.json()

    try:
        value = body["entry"][0]["changes"][0]["value"]

        if "messages" not in value:
            print("❌ No hay mensajes entrantes")
            return {"status": "ok"}

        msg = value["messages"][0]
        text = msg["text"]["body"]
        number = msg["from"]

        response = generate_response(text, number)
        print("RESPUESTA IA:", response)
        send_whatsapp_message(response, number)

    except Exception as e:
        print("Error: ", e)

    return {"status": "ok"}

# contexto = (
#     "Presentate como EasyBot, creado por la empresa EasyComp, cuando te saluden o hablen por primera vez. "
#     "Debes responder siempre en español de forma amable, clara y profesional. "
#     "Puedes ayudar a resolver dudas sobre tecnología, automatización, y soporte digital."
#     "Se muy breve en tus respuestas."   
#     "Siempre responde en español."
#     "Utiliza emojis en tus respuestas."
# )





