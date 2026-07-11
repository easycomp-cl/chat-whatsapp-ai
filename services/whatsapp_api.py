import requests
import os
from dotenv import load_dotenv

load_dotenv()
def send_whatsapp_message(text, number):
    url = f"https://graph.facebook.com/v18.0/{os.getenv('PHONE_NUMBER_ID')}/messages"
    headers = {
        "Authorization": f"Bearer {os.getenv('WHATSAPP_TOKEN')}",
        "Content-Type": "application/json"
    }
    data = {
        "messaging_product": "whatsapp",
        "to": number,
        "type": "text",
        "text": {
            "body": text
        }
    }

    try:
        res = requests.post(url, headers=headers, json=data)
        #print("TOKEN ACTUAL:", os.getenv("WHATSAPP_TOKEN"))
        print("✅ WhatsApp status:", res.status_code)
        print("📦 WhatsApp response:", res.text)
    except Exception as e:
        print("❌ Error al enviar mensaje:", e)
