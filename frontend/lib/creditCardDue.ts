import type { CreditCardBankMonthRow } from "./types";

/** N-ésimo día hábil (lun–vie) del mes. No incluye feriados. */
export function nthBusinessDayDate(year: number, month: number, n: number): Date | null {
  if (n < 1 || n > 31) return null;
  const last = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= last; day++) {
    const d = new Date(year, month - 1, day);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) {
      count++;
      if (count === n) return d;
    }
  }
  return null;
}

/** Días hasta el vencimiento (misma semántica que fijos: solo mes calendario actual). */
export function daysUntilCcDue(
  row: Pick<CreditCardBankMonthRow, "due_mode" | "due_day" | "business_nth">,
  periodYear: number,
  periodMonth: number
): number | null {
  const today = new Date();
  if (today.getFullYear() !== periodYear || today.getMonth() + 1 !== periodMonth) return null;

  const mode = row.due_mode === "business" ? "business" : "calendar";
  let dueDate: Date | null = null;

  if (mode === "business" && row.business_nth != null && row.business_nth >= 1) {
    dueDate = nthBusinessDayDate(periodYear, periodMonth, row.business_nth);
  } else if (mode === "calendar" && row.due_day != null) {
    const d = row.due_day;
    if (d >= 1 && d <= 31) {
      const last = new Date(periodYear, periodMonth, 0).getDate();
      dueDate = new Date(periodYear, periodMonth - 1, Math.min(d, last));
    }
  }

  if (!dueDate) return null;
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  return Math.round((startDue.getTime() - startToday.getTime()) / 86400000);
}

export function formatUrgencyFromDaysLeft(left: number): string {
  if (left < 0) return `Vencido hace ${Math.abs(left)} ${Math.abs(left) === 1 ? "día" : "días"}`;
  if (left === 0) return "Vence hoy";
  if (left === 1) return "Vence mañana";
  return `Vence en ${left} días`;
}

export function formatCcDueSubtitle(row: CreditCardBankMonthRow): string {
  if (row.due_mode === "business" && row.business_nth != null && row.business_nth >= 1) {
    return `Resumen: ${row.business_nth}º día hábil del mes (lun–vie)`;
  }
  if (row.due_day != null && row.due_day >= 1 && row.due_day <= 31) {
    return `Resumen el día ${row.due_day} de cada mes`;
  }
  return "Cuota de tarjeta (este mes)";
}
