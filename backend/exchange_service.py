import httpx
from typing import Optional

DOLAR_API_BLUE_URL = "https://dolarapi.com/v1/dolares/blue"
DOLAR_API_OFICIAL_URL = "https://dolarapi.com/v1/dolares/oficial"

# Rates for non-USD currencies relative to ARS (updated via DolarAPI)
SUPPORTED_CURRENCIES = {"USD", "EUR", "ARS"}


async def get_ars_conversion_rate(currency: str) -> float:
    """
    Returns how many ARS equals 1 unit of the given currency.
    Uses DolarAPI for USD/EUR. Returns 1.0 for ARS.
    """
    currency = currency.upper().strip()

    if currency == "ARS":
        return 1.0

    if currency == "USD":
        return await _fetch_usd_blue_rate()

    if currency == "EUR":
        return await _fetch_eur_rate()

    # Fallback: unknown currency, treat as ARS
    return 1.0


async def _fetch_usd_blue_rate() -> float:
    """Fetches the 'venta' (sell) price of dólar blue from DolarAPI."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(DOLAR_API_BLUE_URL)
        response.raise_for_status()
        data = response.json()
        return float(data["venta"])


async def _fetch_eur_rate() -> float:
    """
    DolarAPI doesn't have EUR directly; we approximate using the official USD
    rate as a baseline. For production, a proper EUR endpoint would be used.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(DOLAR_API_OFICIAL_URL)
        response.raise_for_status()
        data = response.json()
        # EUR is typically ~1.08 USD; approximate conversion
        usd_oficial = float(data["venta"])
        return round(usd_oficial * 1.08, 2)


async def get_all_rates() -> list:
    """Fetches all available dollar rates from DolarAPI."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get("https://dolarapi.com/v1/dolares")
        response.raise_for_status()
        return response.json()
