import json
import os
import re
from typing import Any, Optional

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage

SYSTEM_PROMPT = """Eres un experto contable argentino. Tu única función es analizar mensajes de gastos y extraer información estructurada.

Devuelve EXCLUSIVAMENTE un JSON válido con esta estructura exacta:
{"description": "string", "original_amount": número_float, "original_currency": "string", "category": "string", "payment_method": "string", "credit_card_bank": "string o null", "credit_installments": número entero o null}

Reglas obligatorias:
- "description": descripción breve y clara del gasto (ej: "Supermercado Carrefour", "Netflix mensual")
- "original_amount": monto numérico exacto (sin símbolos)
- "original_currency": código ISO de 3 letras (ARS, USD, EUR). Si no se menciona moneda, usa ARS.
- "category": SOLO una de estas opciones exactas: Supermercado, Transporte, Suscripciones, Ocio, Salud, Otro
- "payment_method": SOLO una de estas opciones EXACTAS (copiá el texto tal cual): Efectivo, Transferencia, Tarjeta de crédito, Tarjeta de débito, Mercado Pago / QR, Otro. Inferilo del mensaje (ej: "en efectivo", "transferí", "con la visa", "débito", "mercado pago", "qr"). Si no se puede inferir, usa Otro.
- "credit_card_bank": si payment_method es "Tarjeta de crédito" y el mensaje nombra un banco (Galicia, Santander, BBVA, Nación, Macro, etc.), poné el nombre corto del banco; si no aplica o no es tarjeta de crédito, null.
- "credit_installments": si es tarjeta de crédito y el mensaje indica cuotas (ej: "en 6 cuotas", "12 cuotas sin interés"), el número entero; si no se menciona cuotas o no es tarjeta, null o 1.

Conversiones de jerga argentina:
- "lucas" = miles (1 luca = 1000 ARS, 15 lucas = 15000 ARS)
- "palo" o "palos" = millones (1 palo = 1000000 ARS)
- "mangos" = ARS
- "dólares", "dls", "usd" = USD
- "euros", "eur" = EUR

NO incluyas texto adicional, markdown, backticks ni explicaciones. SOLO el JSON."""


ACTION_SYSTEM_PROMPT = """Eres un experto contable argentino. El usuario puede:
1) REGISTRAR un gasto nuevo (describe algo que gastó o acaba de gastar).
2) EDITAR un gasto que ya cargó (monto, descripción, categoría, medio de pago, banco de tarjeta, cantidad de cuotas, moneda, etc.).
3) ELIMINAR un gasto (borrar, quitar, sacar, anular un gasto ya cargado). NO lo borres en el servidor; solo indicá qué id eliminar.

Gastos recientes del usuario (cada línea incluye medio de pago, banco y cuotas actuales; el primero es el más reciente):
---
{recent_expenses}
---

Medios de pago permitidos — el campo payment_method en create o en patch debe ser EXACTAMENTE uno de estos textos (copiá el texto tal cual, incluyendo mayúsculas y el slash en Mercado Pago):
---
{payment_methods_block}
---

Bancos de tarjeta del usuario — si payment_method es "Tarjeta de crédito", el campo credit_card_bank debe ser EXACTAMENTE uno de estos nombres (misma mayúsculas/minúsculas que en la lista), o null solo si la lista dice que no hay bancos configurados:
---
{user_banks_block}
---

Historial reciente del chat (mantené contexto: si ya hablaron de un gasto concreto, no lo pierdas en el siguiente turno):
---
{conversation_block}
---

Memoria y seguimiento (muy importante):
- Si en el historial el usuario ya pidió editar un gasto concreto (por nombre, descripción o id) y el mensaje actual solo aclara el banco, las cuotas, el medio de pago o responde a una lista de opciones (ej. "usá Supervielle", "con Galicia"), devolvé action "edit" con el MISMO expense_id que corresponde a ese gasto y un patch que combine lo pedido ahora con lo ya acordado (ej. payment_method: "Tarjeta de crédito" y credit_card_bank: "Supervielle").
- NO pidas de nuevo "qué gasto editar" si el historial ya lo identificó, salvo que falte por completo el gasto o sea ambiguo entre varios.
- Si el asistente listó bancos disponibles y el usuario eligió uno, aplicá ese banco al gasto que se estaba editando en el historial.
- Preguntas como "qué bancos tengo" son aclaración: podés usar clarify con la lista, pero en el siguiente mensaje cuando el usuario elige un banco, debe ser edit sobre el gasto ya mencionado.

Reglas para tarjeta de crédito y cuotas:
- Si el usuario pide "en N cuotas", "en 3 cuotas sin interés", etc., incluí credit_installments con el entero N (entre 1 y 60; 1 = un solo pago).
- Si cambiás o creás un gasto con "Tarjeta de crédito", siempre incluí credit_card_bank con un nombre de la lista de bancos (si la lista está vacía, usá clarify indicando que debe cargar bancos en Configuración).
- Si el usuario pasa de tarjeta a otro medio, podés poner credit_card_bank en null y credit_installments en 1 en el patch.
- Para EDITAR solo cuotas en un gasto que ya es tarjeta, podés enviar patch solo con credit_installments (y credit_card_bank si cambia el banco).

Devolvé EXCLUSIVAMENTE un JSON válido con UNA de estas formas (sin markdown ni texto extra):

A) Gasto NUEVO — cuando registra un gasto sin referirse a uno existente:
{{"action":"create","data":{{"description":"...","original_amount":número,"original_currency":"ARS|USD|EUR","category":"Supermercado|Transporte|Suscripciones|Ocio|Salud|Otro","payment_method":"<uno exacto de la lista de medios>","credit_card_bank":null o string exacto de la lista de bancos,"credit_installments":null o entero 1-60}}}}

B) EDITAR un gasto existente — cuando pide modificar algo ya cargado:
{{"action":"edit","expense_id":<entero id de la lista>,"patch":{{...solo campos que cambian: description, original_amount, original_currency, category, payment_method, credit_card_bank, credit_installments}}}}

C) ELIMINAR — cuando pide borrar/eliminar/quitar/sacar un gasto (ej: "borrá Netflix", "eliminá el último gasto"):
{{"action":"delete","expense_id":<entero id de la lista>}}

D) Si falta información para saber qué gasto o qué hacer:
{{"action":"clarify","message":"una pregunta corta en español"}}

Reglas para EDITAR y ELIMINAR:
- Si dice "el último", "el más reciente", "recién", usá el id de la primera línea de la lista.
- Si menciona Netflix, Uber, etc., elegí el id cuya descripción encaje mejor.
- Si hay varios candidatos igual de probables, usá clarify pidiendo que aclare el id o la descripción.
- El patch (en edit) debe tener al menos un campo; no envíes patch vacío.

Categorías de gasto: Supermercado, Transporte, Suscripciones, Ocio, Salud, Otro. Jerga argentina: lucas=miles, palo=millones, mangos=ARS, dólares/usd=USD, euros/EUR.

NO incluyas markdown ni backticks. SOLO el JSON."""


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

    async def extract_expense_action(
        self,
        user_message: str,
        recent_expenses_text: str,
        payment_methods_block: str,
        user_banks_block: str,
        conversation_block: str,
    ) -> dict[str, Any]:
        """
        Decide crear gasto, editar, eliminar (intención) o pedir aclaración.
        Devuelve un dict con keys: action (create|edit|delete|clarify) y los campos correspondientes.
        """
        if not self.llm:
            raise ValueError(
                "GEMINI_API_KEY no configurada. Por favor configure la variable de entorno."
            )

        system = ACTION_SYSTEM_PROMPT.format(
            recent_expenses=recent_expenses_text,
            payment_methods_block=payment_methods_block,
            user_banks_block=user_banks_block,
            conversation_block=conversation_block,
        )
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

        action = data.get("action")
        if action not in ("create", "edit", "delete", "clarify"):
            raise ValueError(f"Acción de IA no reconocida: {data}")

        if action == "clarify":
            msg = data.get("message")
            if not msg or not isinstance(msg, str):
                raise ValueError("La IA no formuló una aclaración válida.")
            return data

        if action == "create":
            inner = data.get("data")
            if not isinstance(inner, dict):
                raise ValueError("Falta el objeto data para crear el gasto.")
            required_keys = {"description", "original_amount", "original_currency", "category"}
            if not required_keys.issubset(inner.keys()):
                raise ValueError(f"Faltan campos en data: {inner}")
            return data

        if action == "edit":
            eid = data.get("expense_id")
            patch = data.get("patch")
            try:
                eid_int = int(eid)
            except (TypeError, ValueError):
                raise ValueError("Falta expense_id válido para editar.") from None
            if eid_int < 1:
                raise ValueError("expense_id inválido.")
            data["expense_id"] = eid_int
            if not isinstance(patch, dict) or not patch:
                raise ValueError("Falta patch con al menos un campo para editar.")
            return data

        if action == "delete":
            eid = data.get("expense_id")
            try:
                eid_int = int(eid)
            except (TypeError, ValueError):
                raise ValueError("Falta expense_id válido para eliminar.") from None
            if eid_int < 1:
                raise ValueError("expense_id inválido.")
            data["expense_id"] = eid_int
            return data

        raise ValueError(f"Respuesta de IA inesperada: {data}")

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
