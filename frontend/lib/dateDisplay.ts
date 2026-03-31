/**
 * Formatea una fecha ISO solo-fecha (YYYY-MM-DD) en calendario local sin corrimiento UTC.
 * Evita que `new Date("2026-03-19")` muestre 18/3 en zonas detrás de UTC.
 */
export function formatISODateOnlyLocal(iso: string, locale = "es-AR"): string {
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? iso : new Date(t).toLocaleDateString(locale);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mo - 1, d).toLocaleDateString(locale);
}
