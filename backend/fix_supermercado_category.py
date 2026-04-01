"""
Script de corrección: actualiza gastos mal categorizados como 'Comidas'
que deberían ser 'Supermercado', basándose en palabras clave en la descripción.

Uso en el servidor:
  docker exec -it <nombre_contenedor_backend> python fix_supermercado_category.py

O con variables de entorno explícitas:
  DATABASE_URL=postgresql://... python fix_supermercado_category.py
"""

import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./database.db")

# Palabras clave que identifican gastos de supermercado / almacén
SUPERMERCADO_KEYWORDS = [
    "supermercado",
    "almacen",
    "almacén",
    "chino",
    "carrefour",
    "disco",
    "coto",
    "jumbo",
    "walmart",
    "dia",
    "día",
    "vea",
    "mercado",
    "verduleria",
    "verdulería",
    "frutería",
    "fruteria",
    "kiosco",
    "quiosco",
    "minimarket",
]

engine = create_engine(DATABASE_URL)

with engine.begin() as conn:
    # Mostrar cuántos gastos tienen categoría 'Comidas'
    total = conn.execute(
        text("SELECT COUNT(*) FROM expense WHERE category = 'Comidas'")
    ).scalar()
    print(f"Total gastos con categoría 'Comidas': {total}")

    # Buscar candidatos a Supermercado dentro de los que son 'Comidas'
    rows = conn.execute(
        text("SELECT id, description, category FROM expense WHERE category = 'Comidas'")
    ).fetchall()

    to_fix = []
    for row in rows:
        desc_lower = (row[1] or "").lower()
        if any(kw in desc_lower for kw in SUPERMERCADO_KEYWORDS):
            to_fix.append((row[0], row[1]))

    if not to_fix:
        print("No se encontraron gastos para corregir.")
    else:
        print(f"\nGastos que se van a cambiar a 'Supermercado' ({len(to_fix)}):")
        for eid, desc in to_fix:
            print(f"  id={eid}  descripción='{desc}'")

        confirm = input("\n¿Confirmar cambio? (s/N): ").strip().lower()
        if confirm == "s":
            ids = [eid for eid, _ in to_fix]
            conn.execute(
                text(
                    "UPDATE expense SET category = 'Supermercado' "
                    "WHERE id = ANY(:ids)" if "postgresql" in DATABASE_URL
                    else "UPDATE expense SET category = 'Supermercado' "
                         "WHERE id IN (" + ",".join(str(i) for i in ids) + ")"
                ),
                {"ids": ids} if "postgresql" in DATABASE_URL else {},
            )
            print(f"✓ {len(to_fix)} gasto(s) actualizados a 'Supermercado'.")
        else:
            print("Cancelado. No se realizaron cambios.")
