import type { Expense } from "./types";

/** Texto completo de medio de pago (tarjeta + banco + cuotas). */
export function paymentMethodFullLabel(expense: Expense): string {
  let s = expense.payment_method ?? "Otro";
  if (expense.payment_method === "Tarjeta de crédito" && expense.credit_card_bank) {
    s += ` · ${expense.credit_card_bank}`;
  }
  if (
    expense.payment_method === "Tarjeta de crédito" &&
    (expense.credit_installments ?? 1) > 1
  ) {
    s += ` · ${expense.credit_installments ?? 1} cuotas`;
  }
  return s;
}
