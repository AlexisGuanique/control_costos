import type {
  AIChatTurn,
  AIExpenseResult,
  AuthToken,
  BudgetSummary,
  CreditCardBreakdown,
  CreditCardPeriodPaidBody,
  DollarRate,
  Expense,
  ExpenseBasePreview,
  ExpenseCreate,
  ExpenseUpdate,
  ExpenseStats,
  ExtraIncome,
  ExtraIncomeCreate,
  FixedExpense,
  FixedExpenseCreate,
  FixedExpenseListFilters,
  MemberBalance,
  MonthlyBudgetUpsert,
  Trip,
  TripCreate,
  TripDetail,
  TripExpense,
  TripExpenseCreate,
  TripMember,
  TripSettlement,
  User,
  UserSearchResult,
  UserUpdate,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("fintrack_token");
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || "Error en la solicitud");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

export async function register(
  email: string,
  password: string,
  fullName: string,
  baseCurrency = "ARS"
): Promise<User> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      full_name: fullName,
      base_currency: baseCurrency,
    }),
  });
  return handleResponse<User>(res);
}

export async function login(email: string, password: string): Promise<AuthToken> {
  const form = new URLSearchParams({ username: email, password });
  const res = await fetch(`${API_URL}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  return handleResponse<AuthToken>(res);
}

export async function getMe(): Promise<User> {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: authHeaders(),
  });
  return handleResponse<User>(res);
}

export async function searchUsers(q: string, tripId?: number): Promise<UserSearchResult[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];
  const params = new URLSearchParams({ q: trimmed });
  if (tripId != null) params.set("trip_id", String(tripId));
  const res = await fetch(`${API_URL}/users/search?${params.toString()}`, {
    headers: authHeaders(),
  });
  return handleResponse<UserSearchResult[]>(res);
}

export async function updateMe(data: UserUpdate): Promise<User> {
  const res = await fetch(`${API_URL}/auth/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  return handleResponse<User>(res);
}

// ─── Expenses ──────────────────────────────────────────────────────────────────

export async function listExpenses(
  limit = 50,
  offset = 0,
  year?: number,
  month?: number
): Promise<Expense[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (year != null && month != null) {
    params.set("year", String(year));
    params.set("month", String(month));
  }
  const res = await fetch(`${API_URL}/expenses?${params}`, { headers: authHeaders() });
  return handleResponse<Expense[]>(res);
}

export async function previewExpenseInBase(
  originalAmount: number,
  originalCurrency: string
): Promise<ExpenseBasePreview> {
  const params = new URLSearchParams({
    original_amount: String(originalAmount),
    original_currency: originalCurrency,
  });
  const res = await fetch(`${API_URL}/expenses/preview-base?${params}`, {
    headers: authHeaders(),
  });
  return handleResponse<ExpenseBasePreview>(res);
}

export async function createExpense(data: ExpenseCreate): Promise<Expense> {
  const res = await fetch(`${API_URL}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  return handleResponse<Expense>(res);
}

export async function createExpenseFromAI(
  message: string,
  conversationHistory?: AIChatTurn[]
): Promise<AIExpenseResult> {
  const body: Record<string, unknown> = { message };
  if (conversationHistory?.length) {
    body.conversation_history = conversationHistory;
  }
  const res = await fetch(`${API_URL}/expenses/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  return handleResponse<AIExpenseResult>(res);
}

export async function updateExpense(id: number, data: ExpenseUpdate): Promise<Expense> {
  const res = await fetch(`${API_URL}/expenses/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  return handleResponse<Expense>(res);
}

export async function deleteExpense(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/expenses/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handleResponse<void>(res);
}

export async function getStats(year?: number, month?: number): Promise<ExpenseStats> {
  const params = new URLSearchParams();
  if (year != null && month != null) {
    params.set("year", String(year));
    params.set("month", String(month));
  }
  const q = params.toString();
  const res = await fetch(
    `${API_URL}/expenses/stats${q ? `?${q}` : ""}`,
    { headers: authHeaders() }
  );
  return handleResponse<ExpenseStats>(res);
}

// ─── Finanzas: presupuesto mensual ─────────────────────────────────────────────

export async function getBudgetSummary(year: number, month: number): Promise<BudgetSummary> {
  const params = new URLSearchParams({ year: String(year), month: String(month) });
  const res = await fetch(`${API_URL}/finances/summary?${params}`, { headers: authHeaders() });
  return handleResponse<BudgetSummary>(res);
}

export async function getCreditCardBreakdown(
  year: number,
  month: number
): Promise<CreditCardBreakdown> {
  const params = new URLSearchParams({ year: String(year), month: String(month) });
  const res = await fetch(`${API_URL}/finances/credit-cards/breakdown?${params}`, {
    headers: authHeaders(),
  });
  return handleResponse<CreditCardBreakdown>(res);
}

export async function setCreditCardPeriodPaid(body: CreditCardPeriodPaidBody): Promise<void> {
  const res = await fetch(`${API_URL}/finances/credit-cards/period-paid`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  await handleResponse<void>(res);
}

export async function upsertMonthlyBudget(data: MonthlyBudgetUpsert): Promise<void> {
  const res = await fetch(`${API_URL}/finances/monthly-budget`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  await handleResponse<{ id: number }>(res);
}

export async function getUsdCriptoVenta(): Promise<{ venta: number }> {
  const res = await fetch(`${API_URL}/rates/usd-cripto`, { headers: authHeaders() });
  return handleResponse<{ venta: number }>(res);
}

export async function listFixedExpenses(
  year?: number,
  month?: number,
  filters?: FixedExpenseListFilters
): Promise<FixedExpense[]> {
  const params = new URLSearchParams();
  if (year != null && month != null) {
    params.set("year", String(year));
    params.set("month", String(month));
  }
  if (filters?.filter && filters.filter !== "all") {
    params.set("filter", filters.filter);
  }
  const q = params.toString();
  const res = await fetch(
    `${API_URL}/finances/fixed-expenses${q ? `?${q}` : ""}`,
    { headers: authHeaders() }
  );
  return handleResponse<FixedExpense[]>(res);
}

export async function createFixedExpense(data: FixedExpenseCreate): Promise<FixedExpense> {
  const res = await fetch(`${API_URL}/finances/fixed-expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  return handleResponse<FixedExpense>(res);
}

export async function updateFixedExpense(
  id: number,
  data: Partial<{
    name: string;
    amount: number;
    amount_currency: "ARS" | "USD" | "EUR";
    is_active: boolean;
    due_day: number | null;
  }>
): Promise<FixedExpense> {
  const res = await fetch(`${API_URL}/finances/fixed-expenses/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  return handleResponse<FixedExpense>(res);
}

export async function setFixedExpensePaidPeriod(
  id: number,
  body: { year: number; month: number; paid: boolean }
): Promise<FixedExpense> {
  const res = await fetch(`${API_URL}/finances/fixed-expenses/${id}/paid-period`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  return handleResponse<FixedExpense>(res);
}

export async function deleteFixedExpense(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/finances/fixed-expenses/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handleResponse<void>(res);
}

export async function listExtraIncome(year: number, month: number): Promise<ExtraIncome[]> {
  const params = new URLSearchParams({ year: String(year), month: String(month) });
  const res = await fetch(`${API_URL}/finances/extra-income?${params}`, { headers: authHeaders() });
  return handleResponse<ExtraIncome[]>(res);
}

export async function createExtraIncome(data: ExtraIncomeCreate): Promise<ExtraIncome> {
  const res = await fetch(`${API_URL}/finances/extra-income`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  return handleResponse<ExtraIncome>(res);
}

export async function deleteExtraIncome(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/finances/extra-income/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handleResponse<void>(res);
}

// ─── Trips ─────────────────────────────────────────────────────────────────────

export async function listTrips(): Promise<Trip[]> {
  const res = await fetch(`${API_URL}/trips`, { headers: authHeaders() });
  return handleResponse<Trip[]>(res);
}

export async function createTrip(data: TripCreate): Promise<Trip> {
  const res = await fetch(`${API_URL}/trips`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  return handleResponse<Trip>(res);
}

export async function getTrip(id: number): Promise<TripDetail> {
  const res = await fetch(`${API_URL}/trips/${id}`, { headers: authHeaders() });
  return handleResponse<TripDetail>(res);
}

export async function updateTrip(id: number, data: Partial<TripCreate & { status: string }>): Promise<Trip> {
  const res = await fetch(`${API_URL}/trips/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  return handleResponse<Trip>(res);
}

export async function addTripMember(tripId: number, email: string): Promise<TripMember> {
  const res = await fetch(`${API_URL}/trips/${tripId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ email }),
  });
  return handleResponse<TripMember>(res);
}

export async function removeTripMember(tripId: number, userId: string): Promise<void> {
  const res = await fetch(`${API_URL}/trips/${tripId}/members/${userId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handleResponse<void>(res);
}

export async function createTripExpenseFromAI(
  tripId: number,
  message: string
): Promise<TripExpense> {
  const res = await fetch(`${API_URL}/trips/${tripId}/expenses/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ message }),
  });
  return handleResponse<TripExpense>(res);
}

export async function addTripExpense(tripId: number, data: TripExpenseCreate): Promise<TripExpense> {
  const res = await fetch(`${API_URL}/trips/${tripId}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  return handleResponse<TripExpense>(res);
}

export async function deleteTripExpense(tripId: number, expenseId: number): Promise<void> {
  const res = await fetch(`${API_URL}/trips/${tripId}/expenses/${expenseId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handleResponse<void>(res);
}

export async function getTripSettlement(tripId: number): Promise<TripSettlement> {
  const res = await fetch(`${API_URL}/trips/${tripId}/settlement`, { headers: authHeaders() });
  return handleResponse<TripSettlement>(res);
}

export async function getRates(): Promise<DollarRate[]> {
  const res = await fetch(`${API_URL}/rates`, {
    headers: authHeaders(),
  });
  return handleResponse<DollarRate[]>(res);
}
