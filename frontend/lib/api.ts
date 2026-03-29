import type {
  AuthToken,
  DollarRate,
  Expense,
  ExpenseCreate,
  ExpenseUpdate,
  ExpenseStats,
  MemberBalance,
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

export async function listExpenses(limit = 50, offset = 0): Promise<Expense[]> {
  const res = await fetch(
    `${API_URL}/expenses?limit=${limit}&offset=${offset}`,
    { headers: authHeaders() }
  );
  return handleResponse<Expense[]>(res);
}

export async function createExpense(data: ExpenseCreate): Promise<Expense> {
  const res = await fetch(`${API_URL}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  return handleResponse<Expense>(res);
}

export async function createExpenseFromAI(message: string): Promise<Expense> {
  const res = await fetch(`${API_URL}/expenses/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ message }),
  });
  return handleResponse<Expense>(res);
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

export async function getStats(): Promise<ExpenseStats> {
  const res = await fetch(`${API_URL}/expenses/stats`, {
    headers: authHeaders(),
  });
  return handleResponse<ExpenseStats>(res);
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
