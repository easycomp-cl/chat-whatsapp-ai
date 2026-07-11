from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage, SystemMessage
import json
import os
from dotenv import load_dotenv

load_dotenv()

llm = ChatGroq(
    groq_api_key=os.getenv("GROQ_API_KEY"),
    model_name="llama3-70b-8192",
    temperature=0.3
)

INTENTIONS = [
    "consulta_horario",
    "hacer_pedido",
    "confirmar_pedido",
    "cancelar_pedido",
    "pregunta_como_esta",
    "saludo",
    "despedida",
    "producto_fuera_menu",
    "pregunta_disponibilidad",
    "agradecimiento",
    "otro"
]



def detectar_intenciones(texto: str) -> list:
    prompt = ChatPromptTemplate.from_messages([
        SystemMessage(content=(
            f"Eres un sistema experto que detecta intenciones en mensajes de texto en lenguaje natural. "
            f"Ejemplo de mensaje1: 'Hola tia, tien abierto? y le quedan hamburguesas?' Intenciones: ['saludo', 'consulta_horario', 'pregunta_disponibilidad']"
            f"Ejemplo de mensaje2: 'buen dia tia, como estas?' Intenciones: ['saludo', 'pregunta_como_esta']"
            f"Puede existir más de una intención en el mensaje. "
            f"Estamos en Chile, por lo que el texto puede venir con errores de ortografía. "
            f"Responde solamente con una lista JSON en minúsculas, sin ningún otro texto. "
            f"Las intenciones posibles incluyen: {', '.join(INTENTIONS)}."
        )),
        HumanMessage(content=f"Mensaje del cliente: {texto}")
    ])
    chain = prompt | llm
    try:
        response = chain.invoke({"texto": texto})
        print("HumanMessage:", texto)
        #print("SystemMessage:", prompt)
        print("INTENCIONES RAW:", response.content)

        # Normalizar el texto antes de parsear
        raw = response.content.strip().lower()

        # Arreglar comillas simples a dobles si vienen así
        raw = raw.replace("'", '"')

        # Extraer sólo el contenido JSON si llega con basura
        start = raw.find("[")
        end = raw.find("]") + 1
        cleaned_json = raw[start:end]

        # Parsear
        return json.loads(cleaned_json)

    except Exception as e:
        print("Error al detectar intenciones:", e)
        return []

