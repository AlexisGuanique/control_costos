import httpx

DOLAR_API_CRIPTO_URL = "https://dolarapi.com/v1/dolares/cripto"

# Rates for non-USD currencies relative to ARS (updated via DolarAPI)
SUPPORTED_CURRENCIES = {"USD", "EUR", "ARS"}


async def get_ars_conversion_rate(currency: str) -> float:
    """
    ARS que equivalen a 1 unidad de la moneda indicada.
    USD: dólar cripto venta (DolarAPI). EUR: aproximación vía USD cripto × 1,08.
    """
    currency = currency.upper().strip()

    if currency == "ARS":
        return 1.0

    if currency == "USD":
        return await get_usd_cripto_ars_rate()

    if currency == "EUR":
        return await _fetch_eur_rate()

    # Fallback: unknown currency, treat as ARS
    return 1.0


async def convert_original_to_base(
    original_amount: float,
    original_currency: str,
    base_currency: str,
) -> tuple[float, float]:
    """
    Convierte un monto a la moneda base del usuario usando ARS como puente
    (mismas cotizaciones que get_ars_conversion_rate).

    Retorna (base_amount redondeado a 2 decimales, tipo_cambio_efectivo)
    donde base_amount ≈ original_amount * tipo_cambio_efectivo (para la UI).
    """
    orig = original_currency.upper().strip()
    base = base_currency.upper().strip()

    if orig == base:
        return round(original_amount, 2), 1.0

    ars_per_orig = await get_ars_conversion_rate(orig)
    ars_per_base = await get_ars_conversion_rate(base)
    if ars_per_base == 0:
        ars_per_base = 1.0

    ars_total = original_amount * ars_per_orig
    base_amount = round(ars_total / ars_per_base, 2)
    rate_used = (base_amount / original_amount) if original_amount else 1.0
    return base_amount, rate_used


async def get_usd_cripto_ars_rate() -> float:
    """ARS por 1 USD según cotización venta del dólar cripto (DolarAPI)."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(DOLAR_API_CRIPTO_URL)
        response.raise_for_status()
        data = response.json()
        return float(data["venta"])


async def _fetch_eur_rate() -> float:
    """EUR sin endpoint directo: ~1,08 USD por EUR × ARS por USD (cripto)."""
    usd_cripto_ars = await get_usd_cripto_ars_rate()
    return round(usd_cripto_ars * 1.08, 2)


async def get_all_rates() -> list:
    """Fetches all available dollar rates from DolarAPI."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get("https://dolarapi.com/v1/dolares")
        response.raise_for_status()
        return response.json()
