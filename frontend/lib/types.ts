export type ExpenseCategory =
  | "Supermercado"
  | "Transporte"
  | "Suscripciones"
  | "Ocio"
  | "Salud"
  | "Otro";

export type ExpenseSource = "Manual" | "WebChat";

export type PaymentMethod =
  | "Efectivo"
  | "Transferencia"
  | "Tarjeta de crédito"
  | "Tarjeta de débito"
  | "Mercado Pago / QR"
  | "Otro";

/** Tarjeta configurada: vencimiento por día de calendario o por N-ésimo día hábil (lun–vie). */
export interface CreditCardBankEntry {
  name: string;
  due_mode: "calendar" | "business";
  /** Si due_mode es calendar: día 1–31. */
  due_day: number | null;
  /** Si due_mode es business: 1.º, 2.º, … día hábil del mes. */
  business_nth: number | null;
  /** Regla de corte (cierre) para asignar el primer vencimiento de una compra. */
  cut_mode: "none" | "calendar" | "weekday";
  /** Si cut_mode es calendar: día 1–31. */
  cut_day: number | null;
  /** Si cut_mode es weekday: día de semana (0=lun … 6=dom). Se usa lun–vie. */
  cut_weekday: number | null;
  /** Si cut_mode es weekday: 1..4 (ej. 2do jueves). */
  cut_weekday_nth: number | null;
}

/** Normaliza respuestas viejas o mezcladas (solo nombre vs objeto completo). */
export function normalizeCreditCardBanks(
  banks: (string | CreditCardBankEntry)[] | undefined
): CreditCardBankEntry[] {
  if (!banks?.length) return [];
  return banks.map((b) => {
    if (typeof b === "string") {
      return {
        name: b,
        due_mode: "calendar" as const,
        due_day: null,
        business_nth: null,
        cut_mode: "none" as const,
        cut_day: null,
        cut_weekday: null,
        cut_weekday_nth: null,
      };
    }
    const mode = b.due_mode === "business" ? ("business" as const) : ("calendar" as const);
    const cutMode =
      b.cut_mode === "calendar" || b.cut_mode === "weekday" ? b.cut_mode : ("none" as const);
    return {
      name: b.name,
      due_mode: mode,
      due_day: b.due_day ?? null,
      business_nth: b.business_nth ?? null,
      cut_mode: cutMode,
      cut_day: cutMode === "calendar" ? (b.cut_day ?? null) : null,
      cut_weekday: cutMode === "weekday" ? (b.cut_weekday ?? null) : null,
      cut_weekday_nth: cutMode === "weekday" ? (b.cut_weekday_nth ?? null) : null,
    };
  });
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  base_currency: string;
  /** Bancos con tarjeta (nombre + día de vencimiento del resumen). */
  credit_card_banks?: CreditCardBankEntry[];
  created_at: string;
}

/** Resultado de búsqueda de usuarios (solo cuentas registradas). */
export interface UserSearchResult {
  id: string;
  full_name: string;
  email: string;
}

export interface Expense {
  id: number;
  user_id: string;
  description: string;
  category: ExpenseCategory;
  original_amount: number;
  original_currency: string;
  exchange_rate_used: number;
  base_amount: number;
  source: ExpenseSource;
  payment_method: PaymentMethod;
  /** Solo si el medio es Tarjeta de crédito. */
  credit_card_bank?: string | null;
  /** Cuotas (solo tarjeta de crédito; 1 = un pago). */
  credit_installments?: number;
  created_at: string;
}

/** Turno de chat enviado al backend para mantener contexto en la IA. */
export interface AIChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Respuesta de POST /expenses/ai (alta, edición, mensaje informativo o borrado pendiente). */
export interface AIExpenseResult {
  action: "created" | "updated" | "pending_delete" | "assistant_message";
  expense?: Expense;
  message?: string;
}

export interface ExpenseStats {
  total_month_base: number;
  base_currency: string;
  by_category: Record<string, number>;
  total_expenses: number;
}

/** Vista previa de conversión a moneda base (mismo criterio que al guardar el gasto). */
export interface ExpenseBasePreview {
  original_amount: number;
  original_currency: string;
  base_amount: number;
  base_currency: string;
  exchange_rate_used: number;
}

/** Resumen sueldo + fijos + variables + ingresos extra (mes seleccionado). */
export interface BudgetSummary {
  year: number;
  month: number;
  base_currency: string;
  salary: number;
  /** Si el sueldo se guardó en USD, el monto en dólares. */
  salary_usd?: number | null;
  /** Cotización venta cripto (ARS/USD) al guardar. */
  salary_cripto_rate_used?: number | null;
  total_extra_income: number;
  total_fixed_expenses: number;
  total_variable_expenses: number;
  total_income: number;
  total_outflows: number;
  remaining: number;
  /** Cuotas de tarjeta del mes (para mostrar como “Pago Tarjeta …”). */
  credit_card_monthly_by_bank?: CreditCardBankMonthRow[];
}

export interface CreditCardBankMonthRow {
  bank: string;
  amount: number;
  label: string;
  /** Pagado este mes (misma semántica que un gasto fijo marcado). */
  paid: boolean;
  due_mode?: string | null;
  due_day?: number | null;
  business_nth?: number | null;
}

export interface CreditCardPeriodPaidBody {
  year: number;
  month: number;
  bank: string;
  paid: boolean;
}

export interface CreditCardPurchaseLine {
  expense_id: number;
  description: string;
  bank: string;
  total_base: number;
  installments: number;
  installment_amount: number;
  current_installment_index: number;
  installments_remaining_after: number;
  purchase_date: string;
}

export interface CreditCardBankDetail {
  bank: string;
  total_due_this_month: number;
  purchases: CreditCardPurchaseLine[];
}

export interface CreditCardBreakdown {
  year: number;
  month: number;
  base_currency: string;
  banks: CreditCardBankDetail[];
}

export interface MonthlyBudgetUpsert {
  year: number;
  month: number;
  salary: number;
  /** "USD" convierte con dólar cripto; "ARS" guarda el monto en pesos. */
  salary_currency?: "USD" | "ARS";
}

export interface FixedExpense {
  id: number;
  user_id: string;
  name: string;
  /** Monto en moneda base (presupuesto). */
  amount: number;
  original_amount?: number | null;
  original_currency?: string | null;
  exchange_rate_used?: number | null;
  is_active: boolean;
  /** Día del mes (1–31) en que vence; null/undefined = sin día fijo */
  due_day?: number | null;
  created_at: string;
  /** Si year+month se envían al listar, indica si está pagado en ese mes */
  paid_this_period: boolean;
}

export interface FixedExpenseCreate {
  name: string;
  amount: number;
  due_day?: number | null;
  /** USD/EUR: se convierte a moneda base con cotización al guardar. */
  amount_currency?: "ARS" | "USD" | "EUR";
}

export interface ExtraIncome {
  id: number;
  user_id: string;
  year: number;
  month: number;
  description: string;
  amount: number;
  original_amount?: number | null;
  original_currency?: string | null;
  exchange_rate_used?: number | null;
  created_at: string;
}

export interface ExtraIncomeCreate {
  year: number;
  month: number;
  description: string;
  amount: number;
  amount_currency?: "ARS" | "USD" | "EUR";
}

export interface ExpenseCreate {
  description: string;
  category: ExpenseCategory;
  original_amount: number;
  original_currency: string;
  payment_method?: PaymentMethod;
  credit_card_bank?: string | null;
  credit_installments?: number;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
}

export interface ExpenseUpdate {
  description?: string;
  category?: ExpenseCategory;
  original_amount?: number;
  original_currency?: string;
  payment_method?: PaymentMethod;
  credit_card_bank?: string | null;
  credit_installments?: number;
}

export interface UserUpdate {
  full_name?: string;
  base_currency?: string;
  credit_card_banks?: CreditCardBankEntry[];
  current_password?: string;
  new_password?: string;
}

/** Filtro al listar gastos fijos: `filter` en query (API `/finances/fixed-expenses`). */
export interface FixedExpenseListFilters {
  filter?: "all" | "paid" | "overdue";
}

// ─── Trip types ────────────────────────────────────────────────────────────────

export type TripStatus = "Activo" | "Completado";
export type TripRole = "Owner" | "Member";

export interface Trip {
  id: number;
  name: string;
  description: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  currency: string;
  status: TripStatus;
  created_by: string;
  created_at: string;
  member_count: number;
  total_amount: number;
}

export interface TripMember {
  id: number;
  user_id: string;
  full_name: string;
  email: string;
  role: TripRole;
  joined_at: string;
}

export interface TripExpenseSplit {
  user_id: string;
  full_name: string;
  amount: number;
}

export interface TripExpense {
  id: number;
  trip_id: number;
  paid_by_id: string;
  paid_by_name: string;
  description: string;
  category: ExpenseCategory;
  original_amount: number;
  original_currency: string;
  exchange_rate_used: number;
  base_amount: number;
  created_at: string;
  splits: TripExpenseSplit[];
}

export interface TripDetail extends Trip {
  members: TripMember[];
  expenses: TripExpense[];
}

export interface MemberBalance {
  user_id: string;
  full_name: string;
  paid: number;
  owed: number;
  balance: number;
}

export interface SettlementTransaction {
  from_user_id: string;
  from_user_name: string;
  to_user_id: string;
  to_user_name: string;
  amount: number;
}

export interface TripSettlement {
  currency: string;
  total_expenses: number;
  balances: MemberBalance[];
  transactions: SettlementTransaction[];
}

export interface TripCreate {
  name: string;
  description?: string;
  destination?: string;
  start_date?: string;
  end_date?: string;
  currency: string;
}

export interface TripExpenseCreate {
  paid_by_id: string;
  description: string;
  category: ExpenseCategory;
  original_amount: number;
  original_currency: string;
}

export interface DollarRate {
  moneda: string;
  casa: string;
  nombre: string;
  compra: number | null;
  venta: number | null;
  fechaActualizacion: string;
}
