import json
import os
import re
from typing import Optional

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage

SYSTEM_PROMPT = """Eres un experto contable argentino. Tu única función es analizar mensajes de gastos y extraer información estructurada.

Devuelve EXCLUSIVAMENTE un JSON válido con esta estructura exacta:
{"description": "string", "original_amount": número_float, "original_currency": "string", "category": "string"}

Reglas obligatorias:
- "description": descripción breve y clara del gasto (ej: "Supermercado Carrefour", "Netflix mensual")
- "original_amount": monto numérico exacto (sin símbolos)
- "original_currency": código ISO de 3 letras (ARS, USD, EUR). Si no se menciona moneda, usa ARS.
- "category": SOLO una de estas opciones exactas: Supermercado, Transporte, Suscripciones, Ocio, Salud, Otro

Conversiones de jerga argentina:
- "lucas" = miles (1 luca = 1000 ARS, 15 lucas = 15000 ARS)
- "palo" o "palos" = millones (1 palo = 1000000 ARS)
- "mangos" = ARS
- "dólares", "dls", "usd" = USD
- "euros", "eur" = EUR

NO incluyas texto adicional, markdown, backticks ni explicaciones. SOLO el JSON."""


def _build_trip_system_prompt(participant_names: list[str], current_user_full_name: str) -> str:
    names_block = "\n".join(f"- {n}" for n in participant_names)
    return f"""Eres un experto contable argentino. Analizas gastos de un viaje compartido y devolvés SOLO un JSON válido.

Participantes del viaje (usá EXACTAMENTE uno de estos nombres en "paid_by", o la palabra "yo"):
{names_block}

Quien envía este mensaje se llama: "{current_user_full_name}"
- Si el gasto lo pagó quien escribe (ej: "pagué yo", "gasté yo", "yo puse"), "paid_by" debe ser exactamente: yo
- Si mencionó otro participante por nombre, "paid_by" debe ser el nombre EXACTO de la lista de arriba (copiá tal cual).

Estructura JSON obligatoria:
{{"description": "string", "original_amount": número_float, "original_currency": "string", "category": "string", "paid_by": "string"}}

Reglas:
- "description", "original_amount", "original_currency", "category": igual que en gastos personales (category: Supermercado, Transporte, Suscripciones, Ocio, Salud, Otro)
- "paid_by": "yo" o uno de los nombres listados exactamente

Jerga argentina: lucas=miles, palo/palos=millones, mangos=ARS, dólares/usd=USD, euros=eur.

NO incluyas markdown ni texto fuera del JSON."""


class AIService:
    def __init__(self) -> None:
        api_key = os.getenv("GEMINI_API_KEY", "")
        self.llm: Optional[ChatGoogleGenerativeAI] = None
        if api_key:
            self.llm = ChatGoogleGenerativeAI(
                model="gemini-2.5-flash",
                google_api_key=api_key,
                temperature=0,
            )

    async def extract_expense(self, user_message: str) -> dict:
        """
        Sends the user message to Gemini and returns a parsed expense dict.
        Raises ValueError if the AI response cannot be parsed.
        """
        if not self.llm:
            raise ValueError(
                "GEMINI_API_KEY no configurada. Por favor configure la variable de entorno."
            )

        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=user_message),
        ]

        response = await self.llm.ainvoke(messages)
        raw = response.content.strip()

        # Strip potential markdown code fences
        raw = re.sub(r"```(?:json)?\s*", "", raw).strip()

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            raise ValueError(f"La IA devolvió una respuesta inválida: {raw}") from e

        required_keys = {"description", "original_amount", "original_currency", "category"}
        if not required_keys.issubset(data.keys()):
            raise ValueError(f"Faltan campos en la respuesta de la IA: {data}")

        return data

    async def extract_trip_expense(
        self,
        user_message: str,
        participant_names: list[str],
        current_user_full_name: str,
    ) -> dict:
        """Extrae gasto de viaje incluyendo quién pagó (nombre o 'yo')."""
        if not self.llm:
            raise ValueError(
                "GEMINI_API_KEY no configurada. Por favor configure la variable de entorno."
            )
        if not participant_names:
            raise ValueError("El viaje no tiene participantes.")

        system = _build_trip_system_prompt(participant_names, current_user_full_name)
        messages = [
            SystemMessage(content=system),
            HumanMessage(content=user_message),
        ]
        response = await self.llm.ainvoke(messages)
        raw = response.content.strip()
        raw = re.sub(r"```(?:json)?\s*", "", raw).strip()

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            raise ValueError(f"La IA devolvió una respuesta inválida: {raw}") from e

        required_keys = {
            "description",
            "original_amount",
            "original_currency",
            "category",
            "paid_by",
        }
        if not required_keys.issubset(data.keys()):
            raise ValueError(f"Faltan campos en la respuesta de la IA: {data}")

        return data


ai_service = AIService()
