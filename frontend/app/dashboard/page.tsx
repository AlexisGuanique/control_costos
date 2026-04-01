"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  Receipt, RefreshCw, BarChart3, TrendingUp, TrendingDown,
  DollarSign, ArrowUpRight, ArrowDownRight, Clock,
  Wallet, CreditCard, ChevronDown, ChevronRight, ChevronLeft,
  AlertTriangle, CheckCircle2, X, Tag,
} from "lucide-react";
import { getStats, getRates, getBudgetSummary, getCreditCardOverview, listExpenses } from "@/lib/api";
import { useUser } from "@/lib/UserContext";
import type {
  ExpenseStats, DollarRate, BudgetSummary,
  CreditCardBankOverview, CreditCardOverviewResponse, Expense,
} from "@/lib/types";

const CATEGORY_COLORS: Record<string, string> = {
  Comidas: "#10b981",
  Supermercado: "#22c55e",
  Delivery: "#84cc16",
  Salidas: "#d946ef",
  Viajes: "#38bdf8",
  Auto: "#f59e0b",
  Hogar: "#14b8a6",
  Familia: "#fb7185",
  "Educación": "#818cf8",
  Deporte: "#22d3ee",
  Belleza: "#f472b6",
  Ocio: "#eab308",
  Ropa: "#a78bfa",
  Mascotas: "#fb923c",
  Regalos: "#f87171",
  Suscripciones: "#a855f7",
  Salud: "#ef4444",
  Transporte: "#3b82f6",
  Otro: "#64748b",
};

const RATE_META: Record<string, { label: string; color: string; bg: string }> = {
  blue:            { label: "Dólar Blue",    color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20" },
  oficial:         { label: "Dólar Oficial", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  bolsa:           { label: "Dólar MEP",     color: "text-purple-400",  bg: "bg-purple-500/10 border-purple-500/20" },
  contadoconliqui: { label: "Dólar CCL",     color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20" },
  cripto:          { label: "Dólar Cripto",  color: "text-pink-400",    bg: "bg-pink-500/10 border-pink-500/20" },
  tarjeta:         { label: "Dólar Tarjeta", color: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/20" },
};

const PRIORITY_ORDER = ["blue", "oficial", "bolsa", "contadoconliqui", "cripto", "tarjeta"];

function formatARS(n: number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(n);
}

function formatRate(n: number | null) {
  if (n === null) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0,
  }).format(n);
}

function timeAgo(isoDate: string): string {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
  if (diff < 1) return "ahora mismo";
  if (diff < 60) return `hace ${diff} min`;
  const h = Math.floor(diff / 60);
  return `hace ${h}h`;
}

function fmtCurrency(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency", currency, maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString("es-AR")}`;
  }
}

// ─── CategoryDetailModal ──────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  backgroundColor: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "12px",
  color: "#f1f5f9",
};
const TOOLTIP_LABEL_STYLE = { color: "#94a3b8", fontWeight: 600, marginBottom: 2 };
const TOOLTIP_ITEM_STYLE = { color: "#f1f5f9" };

function CategoryDetailModal({
  category, expenses, currency, onClose,
}: {
  category: string;
  expenses: Expense[];
  currency: string;
  onClose: () => void;
}) {
  const color = CATEGORY_COLORS[category] ?? "#64748b";
  const total = expenses.reduce((s, e) => s + e.base_amount, 0);

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-700 bg-[#1e293b] shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-800/80 px-4 py-3.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${color}22` }}
          >
            <Tag className="h-4 w-4" style={{ color }} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-white">{category}</h2>
            <p className="text-xs text-slate-400">
              {expenses.length} gasto{expenses.length !== 1 ? "s" : ""}
              {" · "}
              Total: <span className="font-semibold text-slate-300">{fmtCurrency(total, currency)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-slate-800/60">
          {expenses.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Sin gastos en esta categoría.</p>
          ) : (
            expenses.map((e) => {
              const isUSD = e.original_currency !== "ARS" && e.original_currency !== currency;
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200 truncate">{e.description}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {new Date(e.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
                      {e.payment_method && (
                        <span className="ml-1.5 text-slate-600">· {e.payment_method}</span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-slate-200 tabular-nums">
                      {fmtCurrency(e.base_amount, currency)}
                    </p>
                    {isUSD && (
                      <p className="text-[11px] text-orange-300/70 tabular-nums">
                        {e.original_currency} {e.original_amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CreditCardBankWidget + Modal ────────────────────────────────────────────

const MONTH_NAMES_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                           "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function CreditCardDetailModal({
  overview, currency, onClose,
}: {
  overview: CreditCardBankOverview;
  currency: string;
  onClose: () => void;
}) {
  const today = new Date();
  const todayYM = [today.getFullYear(), today.getMonth() + 1] as [number, number];

  const isGteToday = (y: number, m: number) =>
    y > todayYM[0] || (y === todayYM[0] && m >= todayYM[1]);

  const futureOrCurrentMonths = overview.months.filter((m) => isGteToday(m.year, m.month));
  const pastMonths = overview.months.filter((m) => !isGteToday(m.year, m.month));
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-700 bg-[#1e293b] shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-800/80 px-4 py-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/15">
            <CreditCard className="h-4 w-4 text-purple-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-white">{overview.bank}</h2>
            <p className="text-xs text-slate-400">Detalle de cuotas</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Summary chips */}
        <div className="flex shrink-0 gap-3 border-b border-slate-800/60 px-4 py-3">
          <div className="flex-1 rounded-xl bg-red-500/10 px-3 py-2 text-center">
            <p className="text-[11px] text-slate-400">Pendiente de pago</p>
            <p className="mt-0.5 text-base font-bold text-red-300 tabular-nums">
              {fmtCurrency(overview.total_remaining, currency)}
            </p>
            {overview.total_remaining_usd != null && overview.total_remaining_usd > 0 && (
              <p className="mt-0.5 text-xs font-semibold text-orange-300 tabular-nums">
                USD {overview.total_remaining_usd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>
          <div className="flex-1 rounded-xl bg-emerald-500/10 px-3 py-2 text-center">
            <p className="text-[11px] text-slate-400">Pagado hasta ahora</p>
            <p className="mt-0.5 text-base font-bold text-emerald-300 tabular-nums">
              {fmtCurrency(overview.total_paid, currency)}
            </p>
            {overview.total_paid_usd != null && overview.total_paid_usd > 0 && (
              <p className="mt-0.5 text-xs font-semibold text-emerald-400/70 tabular-nums">
                USD {overview.total_paid_usd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Upcoming months */}
          <div className="px-4 pt-4 pb-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Meses pendientes
            </p>
            {futureOrCurrentMonths.length === 0 ? (
              <p className="text-sm text-slate-500">Sin cuotas pendientes.</p>
            ) : (
              <div className="space-y-1.5">
                {futureOrCurrentMonths.map((m) => {
                  const isCurrent = m.year === todayYM[0] && m.month === todayYM[1];
                  return (
                    <div
                      key={`${m.year}-${m.month}`}
                      className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${
                        m.paid
                          ? "bg-emerald-500/8 ring-1 ring-emerald-500/20"
                          : isCurrent
                          ? "bg-amber-500/10 ring-1 ring-amber-500/25"
                          : "bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {m.paid ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <div className={`h-2 w-2 rounded-full ${isCurrent ? "bg-amber-400" : "bg-slate-600"}`} />
                        )}
                        <span className={`text-sm font-medium ${m.paid ? "text-emerald-200" : isCurrent ? "text-amber-200" : "text-slate-200"}`}>
                          {MONTH_NAMES[m.month - 1]} {m.year}
                          {isCurrent && <span className="ml-1.5 text-[10px] text-amber-400/80 font-normal">este mes</span>}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-semibold tabular-nums ${m.paid ? "text-emerald-300" : isCurrent ? "text-amber-300" : "text-slate-300"}`}>
                          {fmtCurrency(m.amount, currency)}
                        </span>
                        {m.amount_usd != null && m.amount_usd > 0 && (
                          <p className="text-[11px] text-orange-300/80 tabular-nums">
                            USD {m.amount_usd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active purchases */}
          {overview.active_purchases.length > 0 && (() => {
            const arsP = overview.active_purchases.filter((p) => p.original_currency !== "USD");
            const usdP = overview.active_purchases.filter((p) => p.original_currency === "USD");
            const renderPurchase = (p: typeof overview.active_purchases[0]) => (
              <div key={p.expense_id} className="rounded-xl border border-slate-700/60 bg-slate-800/40 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">{p.description}</p>
                    <p className="text-[11px] text-slate-500">
                      {new Date(p.purchase_date).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
                      {" · "}
                      Primera cuota: {MONTH_NAMES_SHORT[p.first_installment_month - 1]} {p.first_installment_year}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {p.original_currency === "USD" && p.original_amount_per_installment != null ? (
                      <p className="text-sm font-semibold text-orange-300 tabular-nums">
                        USD {p.original_amount_per_installment.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-[11px] text-slate-500">/mes</span>
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-slate-200 tabular-nums">
                        {fmtCurrency(p.amount_per_installment, currency)}
                        <span className="text-[11px] text-slate-500">/mes</span>
                      </p>
                    )}
                    {p.installments > 1 ? (
                      <>
                        <p className="text-[11px] font-medium text-purple-400">
                          {p.installments_remaining} de {p.installments} cuotas restantes
                        </p>
                        {p.original_currency === "USD" && p.original_amount_remaining != null ? (
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            Total restante: USD {p.original_amount_remaining.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        ) : (
                          <p className="text-[11px] text-slate-500">
                            Total restante: {fmtCurrency(p.amount_remaining, currency)}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-[11px] text-slate-500">Pago único</p>
                    )}
                  </div>
                </div>
              </div>
            );
            return (
              <div className="px-4 pt-3 pb-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Compras activas
                </p>
                {arsP.length > 0 && (
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Gastos en pesos</span>
                      <div className="flex-1 h-px bg-slate-700/60" />
                    </div>
                    <div className="space-y-2 mb-3">
                      {arsP.map(renderPurchase)}
                    </div>
                  </>
                )}
                {usdP.length > 0 && (
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-400/70">Gastos en dólares</span>
                      <div className="flex-1 h-px bg-orange-700/30" />
                    </div>
                    <div className="space-y-2">
                      {usdP.map(renderPurchase)}
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* Past months (collapsible) */}
          {pastMonths.length > 0 && (
            <div className="px-4 pt-2 pb-4">
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-300 transition"
              >
                {showHistory ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Historial ({pastMonths.length} meses)
              </button>
              {showHistory && (
                <div className="mt-2 space-y-1.5">
                  {[...pastMonths].reverse().map((m) => (
                    <div
                      key={`${m.year}-${m.month}`}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 ${
                        m.paid ? "bg-emerald-500/6 ring-1 ring-emerald-500/15" : "bg-slate-800/40"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {m.paid
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/70" />
                          : <AlertTriangle className="h-3.5 w-3.5 text-red-400/70" />
                        }
                        <span className="text-sm text-slate-400">
                          {MONTH_NAMES[m.month - 1]} {m.year}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm tabular-nums ${m.paid ? "text-emerald-400/80" : "text-red-400/80"}`}>
                          {fmtCurrency(m.amount, currency)}
                        </span>
                        {m.amount_usd != null && m.amount_usd > 0 && (
                          <p className="text-[11px] text-orange-300/60 tabular-nums">
                            USD {m.amount_usd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreditCardBankWidget({
  overview, currency, onClick,
}: {
  overview: CreditCardBankOverview;
  currency: string;
  onClick: () => void;
}) {
  const total = overview.total_paid + overview.total_remaining;
  const paidPct = total > 0 ? (overview.total_paid / total) * 100 : 0;
  const activePurchases = overview.active_purchases.length;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-2xl border border-slate-700/60 bg-slate-800/50 p-4 text-left hover:border-purple-500/40 hover:bg-slate-800/80 transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/40"
    >
      {/* Bank name */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 group-hover:bg-purple-500/25 transition">
          <CreditCard className="h-4 w-4 text-purple-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white truncate">{overview.bank}</p>
          <p className="text-[11px] text-slate-400">
            {activePurchases === 0
              ? "Sin cuotas pendientes"
              : `${activePurchases} compra${activePurchases !== 1 ? "s" : ""} activa${activePurchases !== 1 ? "s" : ""}`}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-slate-300 transition" />
      </div>

      {/* Progress bar */}
      <div className="mb-2.5">
        <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${paidPct}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-500">
          <span>{paidPct.toFixed(0)}% pagado</span>
          <span>{(100 - paidPct).toFixed(0)}% pendiente</span>
        </div>
      </div>

      {/* Amounts */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-red-500/8 px-2.5 py-2">
          <p className="text-[10px] text-slate-400">Pendiente</p>
          <p className="text-sm font-bold text-red-300 tabular-nums">
            {fmtCurrency(overview.total_remaining, currency)}
          </p>
          {overview.total_remaining_usd != null && overview.total_remaining_usd > 0 && (
            <p className="text-[10px] font-semibold text-orange-300 tabular-nums mt-0.5">
              USD {overview.total_remaining_usd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
        </div>
        <div className="rounded-xl bg-emerald-500/8 px-2.5 py-2">
          <p className="text-[10px] text-slate-400">Pagado</p>
          <p className="text-sm font-bold text-emerald-300 tabular-nums">
            {fmtCurrency(overview.total_paid, currency)}
          </p>
          {overview.total_paid_usd != null && overview.total_paid_usd > 0 && (
            <p className="text-[10px] font-semibold text-emerald-400/60 tabular-nums mt-0.5">
              USD {overview.total_paid_usd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── BudgetSummarySection ─────────────────────────────────────────────────────

function BudgetSummarySection({
  summary, currency, daysInMonth, dayOfMonth,
}: {
  summary: BudgetSummary;
  currency: string;
  daysInMonth: number;
  dayOfMonth: number;
}) {
  const income = summary.total_income;
  const outflows = summary.total_outflows;
  const remaining = summary.remaining;
  const usedPct = income > 0 ? Math.min(100, (outflows / income) * 100) : 0;
  const savingsRate = income > 0 ? ((remaining / income) * 100) : 0;

  const ccTotal = (summary.credit_card_monthly_by_bank ?? []).reduce((s, r) => s + r.amount, 0);
  const fixedNet = summary.total_fixed_expenses - ccTotal;

  const dailyBudget = income > 0 && daysInMonth > 0 ? income / daysInMonth : 0;
  const dailyActual = dayOfMonth > 0 ? outflows / dayOfMonth : 0;
  const dailyDiff = dailyActual - dailyBudget;

  const rows: { label: string; value: number; color: string; bg: string }[] = [
    { label: "Sueldo + ingresos extra", value: income, color: "text-emerald-300", bg: "bg-emerald-500/10" },
    { label: "Gastos fijos pagados", value: fixedNet, color: "text-amber-300", bg: "bg-amber-500/10" },
    { label: "Tarjetas de crédito", value: ccTotal, color: "text-purple-300", bg: "bg-purple-500/10" },
    { label: "Gastos variables", value: summary.total_variable_expenses, color: "text-blue-300", bg: "bg-blue-500/10" },
  ];

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-5 space-y-4">
      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Utilización del presupuesto</span>
          <span className={`text-sm font-bold tabular-nums ${usedPct >= 90 ? "text-red-400" : usedPct >= 70 ? "text-amber-400" : "text-emerald-400"}`}>
            {usedPct.toFixed(1)}%
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-slate-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${usedPct >= 90 ? "bg-red-500" : usedPct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>

      {/* Rows */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rows.map((r) => (
          <div key={r.label} className={`rounded-xl p-3 ${r.bg}`}>
            <p className="text-[11px] text-slate-400 leading-snug">{r.label}</p>
            <p className={`mt-1 text-sm font-bold tabular-nums ${r.color}`}>
              {fmtCurrency(r.value, currency)}
            </p>
          </div>
        ))}
      </div>

      {/* Balance + tasa de ahorro + gasto diario */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        {/* Balance */}
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
          remaining >= 0 ? "border-emerald-500/25 bg-emerald-500/8" : "border-red-500/25 bg-red-500/8"
        }`}>
          {remaining >= 0
            ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
            : <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
          }
          <div>
            <p className="text-xs text-slate-400">Saldo disponible</p>
            <p className={`text-base font-bold tabular-nums ${remaining >= 0 ? "text-emerald-300" : "text-red-400"}`}>
              {fmtCurrency(remaining, currency)}
            </p>
          </div>
        </div>

        {/* Tasa de ahorro */}
        <div className="flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-3">
          {savingsRate > 0
            ? <TrendingUp className="h-5 w-5 shrink-0 text-emerald-400" />
            : <TrendingDown className="h-5 w-5 shrink-0 text-red-400" />
          }
          <div>
            <p className="text-xs text-slate-400">Tasa de ahorro</p>
            <p className={`text-base font-bold tabular-nums ${savingsRate > 0 ? "text-emerald-300" : "text-red-400"}`}>
              {savingsRate.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Gasto diario */}
        <div className="flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-3">
          {dailyDiff <= 0
            ? <ArrowDownRight className="h-5 w-5 shrink-0 text-emerald-400" />
            : <ArrowUpRight className="h-5 w-5 shrink-0 text-red-400" />
          }
          <div className="min-w-0">
            <p className="text-xs text-slate-400">Gasto diario prom.</p>
            <p className={`text-base font-bold tabular-nums ${dailyDiff <= 0 ? "text-emerald-300" : "text-red-400"}`}>
              {fmtCurrency(dailyActual, currency)}
            </p>
            <p className="text-[11px] text-slate-500 leading-none">
              objetivo: {fmtCurrency(dailyBudget, currency)}/día
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function DashboardPage() {
  const { user } = useUser();
  const now = useMemo(() => new Date(), []);
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth() + 1;

  const [periodYear, setPeriodYear] = useState(todayYear);
  const [periodMonth, setPeriodMonth] = useState(todayMonth);

  const [stats, setStats] = useState<ExpenseStats | null>(null);
  const [rates, setRates] = useState<DollarRate[]>([]);
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(null);
  const [ccOverview, setCcOverview] = useState<CreditCardOverviewResponse | null>(null);
  const [selectedBankOverview, setSelectedBankOverview] = useState<CreditCardBankOverview | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryExpenses, setCategoryExpenses] = useState<Expense[]>([]);
  const [loadingCategoryModal, setLoadingCategoryModal] = useState(false);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingRates, setLoadingRates] = useState(true);
  const [loadingBudget, setLoadingBudget] = useState(true);
  const [loadingCC, setLoadingCC] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ratesError, setRatesError] = useState(false);

  const baseCurrency = user?.base_currency ?? "ARS";

  const isCurrentPeriod = periodYear === todayYear && periodMonth === todayMonth;
  const daysInMonth = new Date(periodYear, periodMonth, 0).getDate();
  const dayOfMonth = isCurrentPeriod ? now.getDate() : daysInMonth;

  const loadPeriodData = useCallback(async (year: number, month: number) => {
    setStats(null);
    setBudgetSummary(null);
    setLoadingStats(true);
    setLoadingBudget(true);
    await Promise.allSettled([
      getStats(year, month)
        .then(setStats)
        .finally(() => setLoadingStats(false)),
      getBudgetSummary(year, month)
        .then(setBudgetSummary)
        .catch(() => {/* ignore */})
        .finally(() => setLoadingBudget(false)),
    ]);
  }, []);

  const loadCcOverview = useCallback(async () => {
    setLoadingCC(true);
    getCreditCardOverview()
      .then(setCcOverview)
      .catch(() => {/* ignore */})
      .finally(() => setLoadingCC(false));
  }, []);

  const loadRates = useCallback(async () => {
    setRatesError(false);
    setLoadingRates(true);
    getRates()
      .then((data) => {
        const sorted = PRIORITY_ORDER
          .map((casa) => data.find((r) => r.casa === casa))
          .filter(Boolean) as DollarRate[];
        setRates(sorted);
      })
      .catch(() => setRatesError(true))
      .finally(() => setLoadingRates(false));
  }, []);

  useEffect(() => { loadRates(); }, [loadRates]);
  useEffect(() => { loadCcOverview(); }, [loadCcOverview]);
  useEffect(() => { loadPeriodData(periodYear, periodMonth); }, [loadPeriodData, periodYear, periodMonth]);

  function handleRefresh() {
    setRefreshing(true);
    Promise.all([loadRates(), loadCcOverview(), loadPeriodData(periodYear, periodMonth)])
      .finally(() => setRefreshing(false));
  }

  function navigateMonth(delta: number) {
    let y = periodYear;
    let m = periodMonth + delta;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1)  { m = 12; y -= 1; }
    setPeriodYear(y);
    setPeriodMonth(m);
  }

  async function handleCategoryClick(categoryName: string) {
    setSelectedCategory(categoryName);
    setLoadingCategoryModal(true);
    try {
      const all = await listExpenses(500, 0, periodYear, periodMonth);
      setCategoryExpenses(all.filter((e) => e.category === categoryName));
    } catch {
      setCategoryExpenses([]);
    } finally {
      setLoadingCategoryModal(false);
    }
  }

  const pieData = stats
    ? Object.entries(stats.by_category).map(([name, value]) => ({ name, value }))
    : [];

  const barData = pieData
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const topCategory = barData[0] ?? null;

  const hasCcData = (ccOverview?.banks.length ?? 0) > 0;
  const totalCcRemaining = ccOverview?.banks.reduce((s, b) => s + b.total_remaining, 0) ?? 0;

  return (
    <div className="p-6 lg:p-8 space-y-8 text-slate-100">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Título */}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">Resumen financiero</p>
        </div>

        {/* Navegador de mes + Actualizar — en mobile ocupan todo el ancho */}
        <div className="flex items-center gap-2">
          {/* Navegador de mes */}
          <div className="flex flex-1 items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/70 p-1">
            <button
              type="button"
              onClick={() => navigateMonth(-1)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => { setPeriodYear(todayYear); setPeriodMonth(todayMonth); }}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium text-center transition ${
                isCurrentPeriod
                  ? "bg-blue-600 text-white"
                  : "text-slate-200 hover:bg-slate-700"
              }`}
            >
              {MONTH_NAMES[periodMonth - 1]} {periodYear}
            </button>
            <button
              type="button"
              onClick={() => navigateMonth(1)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Actualizar */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="shrink-0 flex items-center gap-2 text-sm text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {/* ── Cotizaciones en vivo ─────────────────────────────────────────── */}
      <section>
        <h2 className="font-semibold text-white mb-3 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-emerald-400" />
          Cotizaciones en vivo
          <span className="ml-auto text-xs text-slate-400 font-normal flex items-center gap-1">
            <Clock className="w-3 h-3" /> DolarAPI
          </span>
        </h2>

        {loadingRates ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-slate-800/50 animate-pulse border border-slate-700/50" />
            ))}
          </div>
        ) : ratesError ? (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm">
            No se pudieron cargar las cotizaciones. Verificá que el backend esté activo.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {rates.map((rate) => {
              const meta = RATE_META[rate.casa] ?? {
                label: rate.nombre, color: "text-slate-200", bg: "bg-slate-700/40 border-slate-700",
              };
              return (
                <div
                  key={rate.casa}
                  className={`rounded-2xl p-4 border flex flex-col gap-2 ${meta.bg}`}
                >
                  <p className={`text-xs font-semibold uppercase tracking-wide ${meta.color}`}>
                    {meta.label}
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                        <ArrowDownRight className="w-3 h-3 text-emerald-500" /> Compra
                      </span>
                      <span className="text-xs font-semibold text-slate-200">
                        {formatRate(rate.compra)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                        <ArrowUpRight className="w-3 h-3 text-red-400" /> Venta
                      </span>
                      <span className="text-sm font-bold text-white">
                        {formatRate(rate.venta)}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-none mt-auto">
                    {timeAgo(rate.fechaActualizacion)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Stats cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Gasto total del mes"
          value={loadingStats ? "..." : formatARS(stats?.total_month_base ?? 0)}
          subtitle={`moneda base: ${baseCurrency}`}
          icon={<Receipt className="w-6 h-6 text-blue-400" />}
          accent="blue"
        />
        <StatCard
          title="Transacciones"
          value={loadingStats ? "..." : String(stats?.total_expenses ?? 0)}
          subtitle="registradas este mes"
          icon={<BarChart3 className="w-6 h-6 text-emerald-400" />}
          accent="emerald"
        />
        <StatCard
          title="Deuda tarjetas pendiente"
          value={loadingCC ? "..." : (hasCcData ? fmtCurrency(totalCcRemaining, baseCurrency) : "—")}
          subtitle={hasCcData ? `${ccOverview!.banks.length} banco${ccOverview!.banks.length !== 1 ? "s" : ""} · total acumulado` : "sin cuotas pendientes"}
          icon={<CreditCard className="w-6 h-6 text-purple-400" />}
          accent="purple"
        />
      </div>

      {/* ── Resumen financiero del mes ───────────────────────────────────── */}
      <section>
        <h2 className="font-semibold text-white mb-3 flex items-center gap-2">
          <Wallet className="w-5 h-5 text-amber-400" />
          Resumen financiero
          <span className="ml-auto text-xs text-slate-400 font-normal">
            {MONTH_NAMES[periodMonth - 1]} {periodYear}
          </span>
        </h2>
        {loadingBudget ? (
          <div className="h-48 rounded-2xl bg-slate-800/50 animate-pulse border border-slate-700/50" />
        ) : budgetSummary ? (
          <BudgetSummarySection
            summary={budgetSummary}
            currency={baseCurrency}
            daysInMonth={daysInMonth}
            dayOfMonth={dayOfMonth}
          />
        ) : (
          <div className="rounded-2xl border border-slate-700 bg-slate-800/40 px-5 py-8 text-center text-slate-400 text-sm">
            <Wallet className="mx-auto mb-2 h-8 w-8 opacity-30" />
            No hay datos de presupuesto para este mes. Cargá tu sueldo en Finanzas.
          </div>
        )}
      </section>

      {/* ── Tarjetas de crédito ──────────────────────────────────────────── */}
      <section>
        <h2 className="font-semibold text-white mb-3 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-purple-400" />
          Tarjetas de crédito
          {hasCcData && !loadingCC && (
            <span className="ml-auto text-xs text-slate-400 font-normal">
              Clic en un banco para ver el detalle
            </span>
          )}
        </h2>

        {loadingCC ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-36 rounded-2xl bg-slate-800/50 animate-pulse border border-slate-700/50" />
            ))}
          </div>
        ) : !hasCcData ? (
          <div className="rounded-2xl border border-slate-700 bg-slate-800/40 px-5 py-8 text-center text-slate-400 text-sm">
            <CreditCard className="mx-auto mb-2 h-8 w-8 opacity-30" />
            No tenés gastos registrados con tarjeta de crédito.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ccOverview!.banks.map((bank) => (
              <CreditCardBankWidget
                key={bank.bank}
                overview={bank}
                currency={baseCurrency}
                onClick={() => setSelectedBankOverview(bank)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Modal de detalle de banco */}
      {selectedBankOverview && (
        <CreditCardDetailModal
          overview={selectedBankOverview}
          currency={baseCurrency}
          onClose={() => setSelectedBankOverview(null)}
        />
      )}

      {/* Modal de detalle de categoría */}
      {selectedCategory && (
        loadingCategoryModal ? (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 rounded-full border-2 border-blue-500/30 border-t-blue-400 animate-spin" />
              <p className="text-sm text-slate-400">Cargando gastos…</p>
            </div>
          </div>
        ) : (
          <CategoryDetailModal
            category={selectedCategory}
            expenses={categoryExpenses}
            currency={baseCurrency}
            onClose={() => { setSelectedCategory(null); setCategoryExpenses([]); }}
          />
        )
      )}

      {/* ── Gráficos ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart */}
        <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-6">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            Distribución por categoría
          </h2>
          {pieData.length > 0 ? (
            <>
              <p className="mb-2 text-[11px] text-slate-500 text-right">Clic en una porción para ver el detalle</p>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    onClick={(data) => handleCategoryClick(data.name)}
                    style={{ cursor: "pointer" }}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] ?? "#64748b"} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [fmtCurrency(v, baseCurrency), "Total"]}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                  />
                  <Legend formatter={(v) => <span style={{ color: "#94a3b8", fontSize: "12px" }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </>
          ) : (
            <EmptyChart />
          )}
        </div>

        {/* Bar chart */}
        <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-6">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-purple-400" />
            Gasto por categoría ({baseCurrency})
          </h2>
          {barData.length > 0 ? (
            <>
              <p className="mb-2 text-[11px] text-slate-500 text-right">Clic en una barra para ver el detalle</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={barData}
                  margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                  onClick={(data) => { if (data?.activePayload?.[0]) handleCategoryClick(data.activePayload[0].payload.name); }}
                  style={{ cursor: "pointer" }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v: number) => [fmtCurrency(v, baseCurrency), "Total"]}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {barData.map((entry) => (
                      <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] ?? "#64748b"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : (
            <EmptyChart />
          )}
        </div>
      </div>

      {/* ── Categoría principal ──────────────────────────────────────────── */}
      {topCategory && (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-800/40 px-5 py-4">
          <TrendingUp className="h-5 w-5 shrink-0 text-purple-400" />
          <div>
            <p className="text-xs text-slate-400">Categoría con más gasto este mes</p>
            <p className="font-semibold text-white">
              {topCategory.name}
              <span className="ml-2 text-sm font-normal text-slate-300">
                {fmtCurrency(topCategory.value, baseCurrency)}
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-[260px] flex flex-col items-center justify-center text-slate-500 gap-2">
      <BarChart3 className="w-10 h-10 opacity-30" />
      <p className="text-sm">Sin gastos este mes</p>
    </div>
  );
}

function StatCard({
  title, value, subtitle, icon, accent,
}: {
  title: string; value: string; subtitle: string; icon: React.ReactNode;
  accent: "blue" | "emerald" | "purple";
}) {
  const cls = {
    blue: "bg-blue-500/10 border-blue-500/20",
    emerald: "bg-emerald-500/10 border-emerald-500/20",
    purple: "bg-purple-500/10 border-purple-500/20",
  };
  return (
    <div className={`rounded-2xl p-5 border flex items-start gap-4 ${cls[accent]}`}>
      <div className="w-12 h-12 rounded-xl bg-slate-800/60 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-slate-400">{title}</p>
        <p className="text-2xl font-bold text-white mt-0.5 truncate">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}
