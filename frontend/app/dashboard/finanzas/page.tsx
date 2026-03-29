"use client";

import { useEffect, useState, useCallback } from "react";
import { Receipt, RefreshCw, TrendingDown } from "lucide-react";
import { listExpenses, getStats } from "@/lib/api";
import { useUser } from "@/lib/UserContext";
import type { Expense, ExpenseStats } from "@/lib/types";
import ExpenseForm from "@/components/ExpenseForm";
import ExpenseTable from "@/components/ExpenseTable";
import ExpenseCard from "@/components/ExpenseCard";
import EditExpenseModal from "@/components/EditExpenseModal";
import AIChatWidget from "@/components/AIChatWidget";

function formatCurrency(amount: number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "ARS" ? "ARS" : currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function FinanzasPage() {
  const { user } = useUser();
  const [expenses, setExpenses]         = useState<Expense[]>([]);
  const [stats, setStats]               = useState<ExpenseStats | null>(null);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const baseCurrency = user?.base_currency ?? "ARS";

  const loadData = useCallback(async () => {
    try {
      const [expensesData, statsData] = await Promise.all([
        listExpenses(),
        getStats(),
      ]);
      setExpenses(expensesData);
      setStats(statsData);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function handleRefresh() {
    setRefreshing(true);
    loadData();
  }

  function handleExpenseCreated(expense: Expense) {
    setExpenses((prev) => [expense, ...prev]);
    getStats().then(setStats).catch(() => {});
  }

  function handleExpenseDeleted(id: number) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    getStats().then(setStats).catch(() => {});
  }

  function handleExpenseUpdated(updated: Expense) {
    setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setEditingExpense(null);
    getStats().then(setStats).catch(() => {});
  }

  const topCategories = stats
    ? Object.entries(stats.by_category).sort(([, a], [, b]) => b - a).slice(0, 2)
    : [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Receipt className="w-7 h-7 text-blue-400" />
            Finanzas Personales
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Registrá y gestioná tus gastos
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 rounded-xl transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Actualizar</span>
        </button>
      </div>

      {/* Resumen rápido */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniStat label="Total del mes"   value={formatCurrency(stats.total_month_base, baseCurrency)} accent="blue" />
          <MiniStat label="Transacciones"   value={String(stats.total_expenses)} accent="emerald" />
          {topCategories.map(([cat, total]) => (
            <MiniStat key={cat} label={cat} value={formatCurrency(total, baseCurrency)} accent="purple" />
          ))}
        </div>
      )}

      {/* Formulario */}
      <div>
        <h2 className="font-semibold text-white mb-3 flex items-center gap-2 text-sm">
          <TrendingDown className="w-4 h-4 text-blue-400" />
          Registrar gasto
        </h2>
        <ExpenseForm onCreated={handleExpenseCreated} />
      </div>

      {/* Historial */}
      <div>
        <h2 className="font-semibold text-white mb-4 flex items-center gap-2 text-sm">
          <Receipt className="w-4 h-4 text-slate-400" />
          Historial de gastos
          <span className="ml-auto text-xs text-slate-500 font-normal">
            {loading ? "Cargando..." : `${expenses.length} registros`}
          </span>
        </h2>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 sm:h-12 rounded-2xl bg-slate-800/50 animate-pulse border border-slate-700/30" />
            ))}
          </div>
        ) : expenses.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Receipt className="w-12 h-12 opacity-20 mx-auto mb-3" />
            <p className="text-base">No hay gastos registrados.</p>
            <p className="text-sm mt-1">Agregá tu primer gasto arriba o usá el chat IA.</p>
          </div>
        ) : (
          <>
            {/* ── Mobile: cards ── */}
            <div className="md:hidden space-y-3">
              {expenses.map((expense) => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  baseCurrency={baseCurrency}
                  onDeleted={handleExpenseDeleted}
                  onEdit={setEditingExpense}
                />
              ))}
            </div>

            {/* ── Desktop: tabla ── */}
            <div className="hidden md:block">
              <ExpenseTable
                expenses={expenses}
                baseCurrency={baseCurrency}
                onDeleted={handleExpenseDeleted}
                onEdit={setEditingExpense}
              />
            </div>
          </>
        )}
      </div>

      {/* Modal de edición */}
      {editingExpense && (
        <EditExpenseModal
          expense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onUpdated={handleExpenseUpdated}
        />
      )}

      {/* Chat IA flotante */}
      <AIChatWidget
        onExpenseCreated={(e) => {
          if ("trip_id" in e) return;
          handleExpenseCreated(e);
        }}
      />
    </div>
  );
}

function MiniStat({ label, value, accent }: {
  label: string; value: string; accent: "blue" | "emerald" | "purple";
}) {
  const cls = {
    blue:    "border-blue-500/20 bg-blue-500/5",
    emerald: "border-emerald-500/20 bg-emerald-500/5",
    purple:  "border-purple-500/20 bg-purple-500/5",
  };
  return (
    <div className={`rounded-xl border p-3 ${cls[accent]}`}>
      <p className="text-xs text-slate-500 truncate">{label}</p>
      <p className="text-lg font-bold text-white mt-0.5 truncate">{value}</p>
    </div>
  );
}
