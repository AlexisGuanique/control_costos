export type ExpenseCategory =
  | "Supermercado"
  | "Transporte"
  | "Suscripciones"
  | "Ocio"
  | "Salud"
  | "Otro";

export type ExpenseSource = "Manual" | "WebChat";

export interface User {
  id: string;
  email: string;
  full_name: string;
  base_currency: string;
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
  created_at: string;
}

export interface ExpenseStats {
  total_month_base: number;
  base_currency: string;
  by_category: Record<string, number>;
  total_expenses: number;
}

export interface ExpenseCreate {
  description: string;
  category: ExpenseCategory;
  original_amount: number;
  original_currency: string;
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
}

export interface UserUpdate {
  full_name?: string;
  base_currency?: string;
  current_password?: string;
  new_password?: string;
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
