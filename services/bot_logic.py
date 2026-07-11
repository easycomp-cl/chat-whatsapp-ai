import os
import json
from datetime import datetime
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage, SystemMessage
from services.intention_detector import detectar_intenciones

# Horario de atención
HORARIO_ATENCION = {
    "inicio": 12,  # 12:00 PM
    "fin": 22      # 22:00 PM
}

# Cargar menú
with open("data/menu.json", encoding="utf-8") as f:
    menu = json.load(f)
    menu_text = "\n".join([f"- {item['nombre']}: ${item['precio']}" for item in menu])

llm = ChatGroq(
    groq_api_key=os.getenv("GROQ_API_KEY"),
    model_name="llama3-70b-8192",
    temperature=0.4
)

system_message = ChatPromptTemplate.from_messages([
    SystemMessage(
        content=(
            "Eres la tía Vero, una amable señora que atiende su local de comida rápida llamado La Picaá de la Vero. "
            "Usa emojis de comida para ilustrar tus respuestas. Responde con cariño como una tía. Por ejemplo: 'Hola mi niño/niña, ¿qué va a querer?'. "
            "Siempre responde en español, de forma directa y simpática. Sugiere platos si el cliente tiene dudas. "
            f"Este es el menú actualizado:\n{menu_text}\n\n"
            "Solo puedes aceptar productos del menú. Si un producto no existe, recházalo amablemente. "
            "Cuando el cliente pida, resume y pide confirmación. Si confirma, responde con total y agradecimiento. Si cancela, despídete con cariño."
        )
    )
])

pending_orders = {}  # Estructura: { "numero_usuario": { "pedido": [...], "total": 0 } }

def esta_abierto() -> bool:
    ahora = datetime.now()
    return HORARIO_ATENCION["inicio"] <= ahora.hour < HORARIO_ATENCION["fin"]

def generate_response(text: str, number: str) -> str:
    print("Entré a generate_response")
    intenciones = detectar_intenciones(text)
    print("Intenciones detectadas:", intenciones)

    respuesta = ""

    if "saludo" in intenciones:
        respuesta += "👋 ¡Hola mi niño/a! Qué alegría leerte. "

    if "consulta_horario" in intenciones:
        if esta_abierto():
            respuesta += "✅ ¡Sí! Estamos atendiendo con mucho gusto 😊. "
        else:
            return "🕒 En este momento estamos cerrados. Nuestro horario de atención es de 12:00 a 22:00 hrs."

    if number in pending_orders:
        if "confirmar_pedido" in intenciones:
            pedido = pending_orders.pop(number)
            return f"✅ Tu pedido ha sido confirmado:\n- " + \
                   "\n- ".join(pedido["pedido"]) + f"\n💵 Total: ${pedido['total']}\nGracias por tu orden!"
        elif "cancelar_pedido" in intenciones:
            pending_orders.pop(number)
            return "🗑️ Pedido cancelado. Puedes hacer uno nuevo cuando quieras."
        else:
            return "❓ ¿Deseas confirmar el pedido anterior? Responde con 'sí' o 'no'."

    productos_pedidos = []
    total = 0
    for item in menu:
        if item["nombre"].lower() in text.lower():
            productos_pedidos.append(item["nombre"])
            total += item["precio"]

    if "pedir_producto" in intenciones and productos_pedidos:
        pending_orders[number] = {
            "pedido": productos_pedidos,
            "total": total
        }
        resumen = "\n- " + "\n- ".join(productos_pedidos)
        return f"📝 Este es tu pedido:{resumen}\n💵 Total: ${total}\n¿Deseas confirmarlo?"

    if not respuesta:
        respuesta = "❌ No entendí bien tu mensaje o no encontré productos válidos. Revisa el menú o pregúntame lo que necesites."

    return respuesta.strip()
