"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Users, Plus, Trash2,   UserPlus, ChevronRight,
  Wallet, ArrowRight, CheckCircle, AlertCircle, Receipt,
  MapPin, Calendar, Plane, Search, Loader2,
} from "lucide-react";
import {
  getTrip, addTripMember, removeTripMember,
  addTripExpense, deleteTripExpense, getTripSettlement, updateTrip,
  searchUsers,
} from "@/lib/api";
import type {
  TripDetail, TripExpense, TripMember, TripSettlement,
  TripExpenseCreate, ExpenseCategory, UserSearchResult,
} from "@/lib/types";
import { useUser } from "@/lib/UserContext";
import AIChatWidget from "@/components/AIChatWidget";
import ConfirmDialog from "@/components/ConfirmDialog";

const CATEGORIES: ExpenseCategory[] = [
  "Comidas",
  "Supermercado",
  "Delivery",
  "Salidas",
  "Viajes",
  "Auto",
  "Hogar",
  "Familia",
  "Educación",
  "Deporte",
  "Belleza",
  "Ropa",
  "Mascotas",
  "Regalos",
  "Suscripciones",
  "Salud",
  "Otro",
];

const CURRENCIES = ["ARS", "USD", "EUR"];

const CATEGORY_COLORS: Record<string, string> = {
  Comidas:       "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  Supermercado:  "bg-green-500/15 text-green-300 border-green-500/20",
  Delivery:      "bg-lime-500/15 text-lime-300 border-lime-500/20",
  Salidas:       "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/20",
  Viajes:        "bg-sky-500/15 text-sky-300 border-sky-500/20",
  Auto:          "bg-amber-500/15 text-amber-300 border-amber-500/20",
  Hogar:         "bg-teal-500/15 text-teal-300 border-teal-500/20",
  Familia:       "bg-rose-500/15 text-rose-300 border-rose-500/20",
  Educación:     "bg-indigo-500/15 text-indigo-300 border-indigo-500/20",
  Deporte:       "bg-cyan-500/15 text-cyan-300 border-cyan-500/20",
  Belleza:       "bg-pink-500/15 text-pink-300 border-pink-500/20",
  Ropa:          "bg-violet-500/15 text-violet-300 border-violet-500/20",
  Mascotas:      "bg-orange-500/15 text-orange-300 border-orange-500/20",
  Regalos:       "bg-red-500/15 text-red-300 border-red-500/20",
  Suscripciones: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  Salud:         "bg-red-500/15 text-red-400 border-red-500/20",
  Otro:          "bg-slate-500/15 text-slate-400 border-slate-500/20",
};

function formatARS(amount: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(amount);
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-600", "bg-purple-600", "bg-emerald-600",
  "bg-amber-600", "bg-rose-600", "bg-cyan-600",
];

function avatar(name: string, idx: number) {
  return `${AVATAR_COLORS[idx % AVATAR_COLORS.length]}`;
}

export default function TripDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const tripId = Number(params.id);

  const [trip, setTrip]             = useState<TripDetail | null>(null);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState<"gastos" | "liquidacion">("gastos");
  const [settlement, setSettlement] = useState<TripSettlement | null>(null);
  const [settlLoading, setSettlLoading] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    null | { type: "remove"; userId: string } | { type: "delete"; expenseId: number }
  >(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const fetchTrip = useCallback(() => {
    getTrip(tripId)
      .then(setTrip)
      .finally(() => setLoading(false));
  }, [tripId]);

  useEffect(() => { fetchTrip(); }, [fetchTrip]);

  async function handleTabChange(tab: "gastos" | "liquidacion") {
    setActiveTab(tab);
    if (tab === "liquidacion" && !settlement) {
      setSettlLoading(true);
      try {
        const s = await getTripSettlement(tripId);
        setSettlement(s);
      } finally {
        setSettlLoading(false);
      }
    }
  }

  async function handleToggleStatus() {
    if (!trip) return;
    const newStatus = trip.status === "Activo" ? "Completado" : "Activo";
    const updated = await updateTrip(tripId, { status: newStatus });
    setTrip((prev) => prev ? { ...prev, status: updated.status } : prev);
  }

  async function handleMemberAdded(member: TripMember) {
    setTrip((prev) => prev ? { ...prev, members: [...prev.members, member] } : prev);
    setSettlement(null);
    setShowAddMember(false);
  }

  function requestRemoveMember(userId: string) {
    setConfirmAction({ type: "remove", userId });
  }

  async function executeConfirm() {
    const action = confirmAction;
    if (!action) return;
    setConfirmLoading(true);
    try {
      if (action.type === "remove") {
        await removeTripMember(tripId, action.userId);
        setTrip((prev) =>
          prev ? { ...prev, members: prev.members.filter((m) => m.user_id !== action.userId) } : prev
        );
      } else {
        await deleteTripExpense(tripId, action.expenseId);
        setTrip((prev) =>
          prev ? { ...prev, expenses: prev.expenses.filter((e) => e.id !== action.expenseId) } : prev
        );
      }
      setSettlement(null);
      setConfirmAction(null);
    } finally {
      setConfirmLoading(false);
    }
  }

  function handleExpenseAdded(expense: TripExpense) {
    setTrip((prev) => prev ? { ...prev, expenses: [expense, ...prev.expenses] } : prev);
    setSettlement(null);
  }

  function requestDeleteExpense(expenseId: number) {
    setConfirmAction({ type: "delete", expenseId });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-white font-semibold">Viaje no encontrado</p>
        <button onClick={() => router.push("/dashboard/viajes")} className="text-blue-400 hover:text-blue-300 text-sm transition">
          ← Volver a viajes
        </button>
      </div>
    );
  }

  const isOwner = trip.members.find((m) => m.user_id === user?.id)?.role === "Owner";

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 text-slate-100">
      {/* Back + Title */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => router.push("/dashboard/viajes")}
          className="mt-1 w-8 h-8 shrink-0 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-white truncate">{trip.name}</h1>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border flex items-center gap-1 ${
              trip.status === "Activo"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-slate-500/10 text-slate-400 border-slate-500/20"
            }`}>
              {trip.status === "Activo" ? <Plane className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
              {trip.status}
            </span>
            {isOwner && (
              <button onClick={handleToggleStatus}
                className="text-xs text-slate-500 hover:text-blue-400 transition underline">
                {trip.status === "Activo" ? "Marcar completado" : "Reabrir"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {trip.destination && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <MapPin className="w-3 h-3" /> {trip.destination}
              </span>
            )}
            {trip.start_date && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Calendar className="w-3 h-3" />
                {trip.start_date}{trip.end_date ? ` → ${trip.end_date}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-slate-500" /> Participantes
          </h2>
          {isOwner && (
            <button onClick={() => setShowAddMember(true)}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium transition">
              <UserPlus className="w-4 h-4" /> Agregar
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {trip.members.map((m, idx) => (
            <div key={m.id} className="group flex items-center gap-2 bg-slate-700/50 border border-slate-600/50 rounded-xl px-3 py-2">
              <div className={`w-7 h-7 rounded-lg ${avatar(m.full_name, idx)} flex items-center justify-center text-xs font-bold text-white`}>
                {initials(m.full_name)}
              </div>
              <div>
                <p className="text-xs font-medium text-white leading-tight">
                  {m.full_name} {m.user_id === user?.id && <span className="text-slate-500">(vos)</span>}
                </p>
                <p className="text-[10px] text-slate-500">{m.role === "Owner" ? "Organizador" : "Participante"}</p>
              </div>
              {isOwner && m.user_id !== user?.id && (
                <button onClick={() => requestRemoveMember(m.user_id)}
                  className="ml-1 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border border-slate-700/60 rounded-xl overflow-hidden bg-slate-800/40">
        {(["gastos", "liquidacion"] as const).map((tab) => (
          <button key={tab} onClick={() => handleTabChange(tab)}
            className={`flex-1 py-2.5 text-sm font-medium transition-all ${
              activeTab === tab
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}>
            {tab === "gastos" ? "💸 Gastos" : "⚖️ Liquidación"}
          </button>
        ))}
      </div>

      {/* Gastos tab */}
      {activeTab === "gastos" && (
        <div className="space-y-4">
          <AddExpenseForm
            trip={trip}
            onAdded={handleExpenseAdded}
          />
          {trip.expenses.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Receipt className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Sin gastos aún. ¡Agregá el primero!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {trip.expenses.map((expense) => (
                <ExpenseItem
                  key={expense.id}
                  expense={expense}
                  currency={trip.currency}
                  currentUserId={user?.id ?? ""}
                  onDelete={() => requestDeleteExpense(expense.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Liquidacion tab */}
      {activeTab === "liquidacion" && (
        <SettlementView
          settlement={settlement}
          loading={settlLoading}
          currency={trip.currency}
        />
      )}

      {/* Add Member Modal */}
      {showAddMember && (
        <AddMemberModal
          tripId={tripId}
          onClose={() => setShowAddMember(false)}
          onAdded={handleMemberAdded}
        />
      )}

      <AIChatWidget
        variant="trip"
        tripId={tripId}
        tripCurrency={trip.currency}
        onExpenseCreated={(e) => {
          if ("trip_id" in e) handleExpenseAdded(e);
        }}
      />

      <ConfirmDialog
        open={confirmAction !== null}
        title={
          confirmAction?.type === "remove"
            ? "Quitar participante"
            : "Eliminar gasto"
        }
        message={
          confirmAction?.type === "remove"
            ? "¿Remover a este participante del viaje? No podrá ver ni cargar gastos en este viaje."
            : "¿Eliminar este gasto del viaje? Esta acción no se puede deshacer."
        }
        confirmLabel={confirmAction?.type === "remove" ? "Quitar" : "Eliminar"}
        variant="danger"
        loading={confirmLoading}
        onConfirm={executeConfirm}
        onCancel={() => !confirmLoading && setConfirmAction(null)}
      />
    </div>
  );
}

// ─── Add Expense Form ─────────────────────────────────────────────────────────

function AddExpenseForm({ trip, onAdded }: {
  trip: TripDetail;
  onAdded: (e: TripExpense) => void;
}) {
  const [open, setOpen]           = useState(false);
  const [paidById, setPaidById]   = useState(trip.members[0]?.user_id ?? "");
  const [description, setDesc]    = useState("");
  const [amount, setAmount]       = useState("");
  const [currency, setCurrency]   = useState(trip.currency);
  const [category, setCategory]   = useState<ExpenseCategory>("Otro");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data: TripExpenseCreate = {
        paid_by_id: paidById,
        description: description.trim(),
        original_amount: parseFloat(amount),
        original_currency: currency,
        category,
      };
      const expense = await addTripExpense(trip.id, data);
      onAdded(expense);
      setDesc(""); setAmount(""); setCategory("Otro");
      setOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al registrar el gasto");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium text-slate-300 hover:text-white transition">
        <span className="flex items-center gap-2"><Plus className="w-4 h-4 text-blue-400" /> Agregar gasto</span>
        <ChevronRight className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="px-4 pb-4 space-y-3 border-t border-slate-700/40 pt-3">
          {/* Who paid */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">¿Quién pagó?</label>
            <select value={paidById} onChange={(e) => setPaidById(e.target.value)}
              className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {trip.members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.full_name}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Descripción</label>
            <input type="text" value={description} onChange={(e) => setDesc(e.target.value)} required
              placeholder="Ej: Pizza en la montaña"
              className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Amount + Currency */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Monto</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required min="0.01" step="any"
                placeholder="0.00"
                className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Moneda</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-2 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Categoría</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button key={cat} type="button" onClick={() => setCategory(cat)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all font-medium ${
                    category === cat
                      ? CATEGORY_COLORS[cat]
                      : "bg-slate-700/40 border-slate-600 text-slate-400 hover:text-white"
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-xs bg-red-500/10 rounded-xl px-4 py-2 border border-red-500/20">{error}</p>}

          <button type="submit" disabled={loading || !description.trim() || !amount}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-semibold transition flex items-center justify-center gap-2">
            {loading
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Plus className="w-4 h-4" />}
            {loading ? "Registrando..." : "Registrar gasto"}
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Expense Item ─────────────────────────────────────────────────────────────

function ExpenseItem({ expense, currency, currentUserId, onDelete }: {
  expense: TripExpense;
  currency: string;
  currentUserId: string;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isOtherCurrency = expense.original_currency !== currency;

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-lg border ${CATEGORY_COLORS[expense.category] ?? CATEGORY_COLORS.Otro}`}>
          {expense.category}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{expense.description}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Pagó <span className="text-slate-300 font-medium">{expense.paid_by_name}</span>
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-white">
            {new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(expense.original_amount)} {expense.original_currency}
          </p>
          {isOtherCurrency && (
            <p className="text-xs text-slate-500">{formatARS(expense.base_amount)}</p>
          )}
        </div>
        <button onClick={onDelete}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expense.splits.length > 0 && (
        <button onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-2.5 border-t border-slate-700/40 text-xs text-slate-500 hover:text-slate-400 transition">
          <span>División entre {expense.splits.length} personas · {formatARS(expense.splits[0]?.amount ?? 0)} c/u</span>
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
      )}

      {expanded && (
        <div className="border-t border-slate-700/40 px-4 py-3 grid grid-cols-2 gap-2">
          {expense.splits.map((split) => (
            <div key={split.user_id} className="flex items-center justify-between bg-slate-700/30 rounded-lg px-3 py-2">
              <span className="text-xs text-slate-300">{split.full_name}</span>
              <span className="text-xs font-medium text-white">{formatARS(split.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Settlement View ──────────────────────────────────────────────────────────

function SettlementView({ settlement, loading, currency }: {
  settlement: TripSettlement | null;
  loading: boolean;
  currency: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }
  if (!settlement) return null;

  return (
    <div className="space-y-4">
      {/* Total */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-blue-300 font-medium">Total del viaje</p>
          <p className="text-2xl font-bold text-white">{formatARS(settlement.total_expenses)}</p>
        </div>
        <Wallet className="w-8 h-8 text-blue-400 opacity-60" />
      </div>

      {/* Balances */}
      <div>
        <h3 className="text-sm font-semibold text-slate-400 mb-3 px-1">Balance por participante</h3>
        <div className="space-y-2.5">
          {settlement.balances.map((b) => (
            <div key={b.user_id} className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">{b.full_name}</p>
                <span className={`text-sm font-bold flex items-center gap-1 ${
                  b.balance > 0.5 ? "text-emerald-400" : b.balance < -0.5 ? "text-red-400" : "text-slate-400"
                }`}>
                  {b.balance > 0.5 && <CheckCircle className="w-4 h-4" />}
                  {b.balance < -0.5 && <AlertCircle className="w-4 h-4" />}
                  {b.balance > 0.5 ? "+" : ""}{formatARS(b.balance)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="bg-slate-700/40 rounded-lg px-3 py-1.5 text-center">
                  <p className="text-[10px] text-slate-500">Pagó</p>
                  <p className="text-xs font-medium text-emerald-400">{formatARS(b.paid)}</p>
                </div>
                <div className="bg-slate-700/40 rounded-lg px-3 py-1.5 text-center">
                  <p className="text-[10px] text-slate-500">Le corresponde</p>
                  <p className="text-xs font-medium text-red-400">{formatARS(b.owed)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transactions */}
      <div>
        <h3 className="text-sm font-semibold text-slate-400 mb-3 px-1">Para saldar las cuentas</h3>
        {settlement.transactions.length === 0 ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 text-center">
            <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
            <p className="text-emerald-400 font-semibold">¡Todos están al día!</p>
            <p className="text-slate-400 text-sm mt-1">No hay deudas pendientes en este viaje.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {settlement.transactions.map((t, i) => (
              <div key={i} className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 mb-0.5">Transferencia recomendada</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-rose-400">{t.from_user_name}</span>
                    <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />
                    <span className="text-sm font-semibold text-emerald-400">{t.to_user_name}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-white">{formatARS(t.amount)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add Member Modal ─────────────────────────────────────────────────────────

function AddMemberModal({ tripId, onClose, onAdded }: {
  tripId: number;
  onClose: () => void;
  onAdded: (m: TripMember) => void;
}) {
  const [query, setQuery]   = useState("");
  const [selected, setSelected] = useState<UserSearchResult | null>(null);
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const [listOpen, setListOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) {
      setSearching(false);
      return;
    }
    const t = query.trim();
    if (t.length < 2) {
      setResults([]);
      setSearching(false);
      setListOpen(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchUsers(t, tripId)
        .then((r) => {
          if (cancelled) return;
          setResults(r);
          setListOpen(true);
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setError("No se pudo buscar usuarios. Intentá de nuevo.");
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, tripId, selected]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setListOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function handleQueryChange(v: string) {
    setQuery(v);
    setSelected(null);
    setError("");
  }

  function pickUser(u: UserSearchResult) {
    setSelected(u);
    setQuery(u.full_name);
    setResults([]);
    setListOpen(false);
    setSearching(false);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!selected) {
      setError("Buscá por nombre y elegí un usuario de la lista (debe tener cuenta en FinTrack AI).");
      return;
    }
    setLoading(true);
    try {
      const member = await addTripMember(tripId, selected.email.trim().toLowerCase());
      onAdded(member);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al agregar participante");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-[#1e293b] rounded-t-3xl sm:rounded-2xl border border-slate-700/80 shadow-2xl">
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-600" />
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="font-semibold text-white">Agregar participante</h2>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-slate-400">
            Escribí al menos 2 letras del nombre. Solo aparecen usuarios registrados; quienes ya están en el viaje no se listan.
          </p>

          <div ref={searchBoxRef} className="relative">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Buscar por nombre</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onFocus={() => {
                  if (!selected && results.length > 0) setListOpen(true);
                }}
                placeholder="Ej: María, Juan"
                disabled={!!selected}
                className="w-full bg-slate-700/60 border border-slate-600 rounded-xl pl-10 pr-10 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
              )}
            </div>

            {selected && (
              <div className="mt-2 flex items-center justify-between gap-2 bg-blue-500/10 border border-blue-500/25 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{selected.full_name}</p>
                  <p className="text-xs text-slate-400 truncate">{selected.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelected(null); setQuery(""); setResults([]); }}
                  className="shrink-0 text-xs text-blue-400 hover:text-blue-300 font-medium"
                >
                  Cambiar
                </button>
              </div>
            )}

            {listOpen && !selected && query.trim().length >= 2 && (
              <ul className="absolute z-20 left-0 right-0 mt-1 max-h-52 overflow-auto rounded-xl border border-slate-600 bg-[#1e293b] shadow-xl">
                {!searching && results.length === 0 && (
                  <li className="px-4 py-3 text-sm text-slate-400">No hay coincidencias</li>
                )}
                {results.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => pickUser(u)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-700/80 transition border-b border-slate-700/50 last:border-0"
                    >
                      <p className="text-sm font-medium text-white">{u.full_name}</p>
                      <p className="text-xs text-slate-500 truncate">{u.email}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="text-red-400 text-xs bg-red-500/10 rounded-xl px-4 py-2 border border-red-500/20">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-400 hover:text-white text-sm font-medium transition">
              Cancelar
            </button>
            <button type="submit" disabled={loading || !selected}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-semibold transition flex items-center justify-center gap-2">
              {loading
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <UserPlus className="w-4 h-4" />}
              {loading ? "Agregando..." : "Agregar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
