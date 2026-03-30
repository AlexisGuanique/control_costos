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

export interface User {
  id: string;
  email: string;
  full_name: string;
  base_currency: string;
  /** Bancos donde tenés tarjeta de crédito (para asociar gastos). */
  credit_card_banks?: string[];
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
  created_at: string;
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
}

export interface UserUpdate {
  full_name?: string;
  base_currency?: string;
  credit_card_banks?: string[];
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
