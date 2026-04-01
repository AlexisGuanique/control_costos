"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  CreditCard,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import {
  listExpenses,
  getStats,
  getBudgetSummary,
  getCreditCardBreakdown,
  upsertMonthlyBudget,
  getUsdCriptoVenta,
  listFixedExpenses,
  createFixedExpense,
  updateFixedExpense,
  setFixedExpensePaidPeriod,
  upsertFixedExpenseAmountOverride,
  deleteFixedExpenseAmountOverride,
  setCreditCardPeriodPaid,
  deleteFixedExpense,
  listExtraIncome,
  createExtraIncome,
  deleteExtraIncome,
} from "@/lib/api";
import { useUser } from "@/lib/UserContext";
import type {
  BudgetSummary,
  CreditCardBankMonthRow,
  CreditCardBreakdown,
  Expense,
  ExpenseStats,
  ExtraIncome,
  FixedExpense,
} from "@/lib/types";
import {
  daysUntilCcDue,
  formatCcDueSubtitle,
  formatUrgencyFromDaysLeft,
} from "@/lib/creditCardDue";
import ExpenseTable from "@/components/ExpenseTable";
import ExpenseCard from "@/components/ExpenseCard";
import ExpenseDetailModal from "@/components/ExpenseDetailModal";
import ExpenseModal from "@/components/ExpenseModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import DayOfMonthPicker from "@/components/DayOfMonthPicker";
import AIChatWidget from "@/components/AIChatWidget";

type FinancesDeleteTarget =
  | null
  | { kind: "fixed"; item: FixedExpense }
  | { kind: "extra"; item: ExtraIncome };

type FixedSectionRow =
  | { kind: "fixed"; item: FixedExpense }
  | { kind: "cc"; row: CreditCardBankMonthRow };

function round2(n: number) { return Math.round(n * 100) / 100; }

function formatCurrency(amount: number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "ARS" ? "ARS" : currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1)
  );
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/**
 * Días hasta el vencimiento en el mes del periodo (hoy vs periodo).
 * Negativo = ya venció este mes. null si no hay due_day o el periodo no es el mes calendario actual.
 */
function daysUntilFixedDue(
  dueDay: number | null | undefined,
  periodYear: number,
  periodMonth: number
): number | null {
  if (dueDay == null || dueDay < 1 || dueDay > 31) return null;
  const today = new Date();
  if (today.getFullYear() !== periodYear || today.getMonth() + 1 !== periodMonth) return null;
  const last = lastDayOfMonth(periodYear, periodMonth);
  const effectiveDue = Math.min(dueDay, last);
  return effectiveDue - today.getDate();
}

type FixedDueUrgency = "overdue" | "soon" | null;

function fixedDueUrgency(
  f: FixedExpense,
  periodYear: number,
  periodMonth: number
): FixedDueUrgency {
  if (!f.is_active || f.paid_this_period) return null;
  const left = daysUntilFixedDue(f.due_day, periodYear, periodMonth);
  if (left == null) return null;
  if (left < 0) return "overdue";
  if (left <= 5) return "soon";
  return null;
}

function urgencyMessageForDueDay(
  dueDay: number | null | undefined,
  periodYear: number,
  periodMonth: number
): string {
  const left = daysUntilFixedDue(dueDay, periodYear, periodMonth);
  if (left == null) return "";
  return formatUrgencyFromDaysLeft(left);
}

function urgencyMessage(f: FixedExpense, periodYear: number, periodMonth: number): string {
  return urgencyMessageForDueDay(f.due_day, periodYear, periodMonth);
}

function ccDueUrgency(
  row: CreditCardBankMonthRow,
  periodYear: number,
  periodMonth: number
): FixedDueUrgency {
  if (row.paid ?? false) return null;
  const left = daysUntilCcDue(row, periodYear, periodMonth);
  if (left == null) return null;
  if (left < 0) return "overdue";
  if (left <= 5) return "soon";
  return null;
}

function CurrencyToggle3({
  value,
  onChange,
  compact,
}: {
  value: "USD" | "ARS" | "EUR";
  onChange: (c: "USD" | "ARS" | "EUR") => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`inline-flex rounded-lg bg-slate-900 p-0.5 ring-1 ring-slate-800 ${compact ? "scale-95" : ""}`}
      role="group"
      aria-label="Moneda del monto"
    >
      {(["USD", "ARS", "EUR"] as const).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
            value === c ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

export default function FinanzasPage() {
  const { user } = useUser();
  const now = new Date();
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<ExpenseStats | null>(null);
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [fixedList, setFixedList] = useState<FixedExpense[]>([]);
  const [extraList, setExtraList] = useState<ExtraIncome[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [salaryInput, setSalaryInput] = useState("");
  const [salaryForMonth, setSalaryForMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [salaryCurrency, setSalaryCurrency] = useState<"USD" | "ARS">("USD");
  const [criptoVenta, setCriptoVenta] = useState<number | null>(null);
  const [savingSalary, setSavingSalary] = useState(false);

  const [fixedName, setFixedName] = useState("");
  const [fixedAmount, setFixedAmount] = useState("");
  const [fixedCurrency, setFixedCurrency] = useState<"USD" | "ARS" | "EUR">("ARS");
  const [fixedDueDay, setFixedDueDay] = useState("");
  const [addingFixed, setAddingFixed] = useState(false);

  const [fixedEdit, setFixedEdit] = useState<FixedExpense | null>(null);
  const [editFixedName, setEditFixedName] = useState("");
  const [editFixedAmount, setEditFixedAmount] = useState("");
  const [editFixedCurrency, setEditFixedCurrency] = useState<"USD" | "ARS" | "EUR">("ARS");
  const [editFixedDueDay, setEditFixedDueDay] = useState("");
  const [editFixedActive, setEditFixedActive] = useState(true);
  const [savingFixedEdit, setSavingFixedEdit] = useState(false);

  const [fixedListFilter, setFixedListFilter] = useState<"all" | "paid" | "overdue">("all");

  // Override de monto mensual para gastos fijos variables
  const [overrideTarget, setOverrideTarget] = useState<FixedExpense | null>(null);
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideCurrency, setOverrideCurrency] = useState<"USD" | "ARS" | "EUR">("ARS");
  const [savingOverride, setSavingOverride] = useState(false);

  const [extraDesc, setExtraDesc] = useState("");
  const [extraAmount, setExtraAmount] = useState("");
  const [extraCurrency, setExtraCurrency] = useState<"USD" | "ARS" | "EUR">("USD");
  const [addingExtra, setAddingExtra] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FinancesDeleteTarget>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [expenseModal, setExpenseModal] = useState<null | "new" | Expense>(null);
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);

  const [ccModalOpen, setCcModalOpen] = useState(false);
  const [ccDetail, setCcDetail] = useState<CreditCardBreakdown | null>(null);
  const [ccLoading, setCcLoading] = useState(false);
  const [ccPortalMounted, setCcPortalMounted] = useState(false);

  useEffect(() => {
    setCcPortalMounted(true);
  }, []);

  const baseCurrency = user?.base_currency ?? "ARS";

  async function openCreditCardModal() {
    setCcModalOpen(true);
    setCcDetail(null);
    setCcLoading(true);
    try {
      const d = await getCreditCardBreakdown(periodYear, periodMonth);
      setCcDetail(d);
    } catch {
      setCcDetail(null);
    } finally {
      setCcLoading(false);
    }
  }

  const fixedTotals = useMemo(() => {
    const active = fixedList.filter((f) => f.is_active);
    const paid = active.filter((f) => f.paid_this_period);
    const unpaid = active.filter((f) => !f.paid_this_period);
    const effectiveAmount = (f: FixedExpense) => f.override_amount ?? f.amount;
    let totalPaid = paid.reduce((s, f) => s + effectiveAmount(f), 0);
    let totalUnpaid = unpaid.reduce((s, f) => s + effectiveAmount(f), 0);
    const cc = summary?.credit_card_monthly_by_bank ?? [];
    for (const row of cc) {
      if (row.paid ?? false) totalPaid += row.amount;
      else totalUnpaid += row.amount;
    }
    return { totalPaid, totalUnpaid };
  }, [fixedList, summary]);

  /** Filtro solo visual: los totales de arriba usan siempre todos los fijos del mes. */
  const displayedFixedExpenses = useMemo(() => {
    if (fixedListFilter === "all") return fixedList;
    if (fixedListFilter === "paid") return fixedList.filter((f) => f.paid_this_period);
    return fixedList.filter(
      (f) => fixedDueUrgency(f, periodYear, periodMonth) === "overdue"
    );
  }, [fixedList, fixedListFilter, periodYear, periodMonth]);

  /** Fijos + cuotas tarjeta del mes, ordenados por nombre. */
  const displayedFixedSectionRows = useMemo((): FixedSectionRow[] => {
    const cc = summary?.credit_card_monthly_by_bank ?? [];
    let ccVisible: CreditCardBankMonthRow[] = [];
    if (fixedListFilter === "all") ccVisible = cc;
    else if (fixedListFilter === "paid") ccVisible = cc.filter((r) => r.paid ?? false);
    else if (fixedListFilter === "overdue")
      ccVisible = cc.filter(
        (r) =>
          !(r.paid ?? false) && ccDueUrgency(r, periodYear, periodMonth) === "overdue"
      );

    // Separar CC por grupo de moneda (ARS primero, USD después)
    const ccArs = ccVisible.filter((r) => (r.currency_group ?? "ARS") === "ARS");
    const ccUsd = ccVisible.filter((r) => r.currency_group === "USD");

    const fixedRows: FixedSectionRow[] = displayedFixedExpenses.map((item) => ({
      kind: "fixed" as const,
      item,
    }));
    fixedRows.sort((a, b) => {
      const na = a.kind === "fixed" ? a.item.name : "";
      const nb = b.kind === "fixed" ? b.item.name : "";
      return na.localeCompare(nb, "es", { sensitivity: "base" });
    });

    const rows: FixedSectionRow[] = [
      ...ccArs.map((row) => ({ kind: "cc" as const, row })),
      ...ccUsd.map((row) => ({ kind: "cc" as const, row })),
      ...fixedRows,
    ];
    return rows;
  }, [displayedFixedExpenses, summary, fixedListFilter, periodYear, periodMonth]);

  const loadData = useCallback(async () => {
    try {
      const [expensesData, statsData, summaryData, fixedData, extraData, cripto] = await Promise.all([
        listExpenses(200, 0, periodYear, periodMonth),
        getStats(periodYear, periodMonth),
        getBudgetSummary(periodYear, periodMonth),
        listFixedExpenses(periodYear, periodMonth),
        listExtraIncome(periodYear, periodMonth),
        getUsdCriptoVenta().catch(() => ({ venta: null as number | null })),
      ]);
      setExpenses(expensesData);
      setStats(statsData);
      setSummary(summaryData);
      setFixedList(fixedData);
      setExtraList(extraData);
      setCriptoVenta(typeof cripto.venta === "number" ? cripto.venta : null);
    } catch {
      setFormError("No se pudo cargar los datos. Revisá la conexión con el servidor.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [periodYear, periodMonth]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  function handleRefresh() {
    setRefreshing(true);
    setFormError(null);
    loadData();
  }

  function handleMonthInput(v: string) {
    if (!v) return;
    const [y, m] = v.split("-").map(Number);
    if (y && m) {
      setPeriodYear(y);
      setPeriodMonth(m);
      setSalaryForMonth(`${y}-${String(m).padStart(2, "0")}`);
    }
  }

  async function handleSaveSalary(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const n = parseFloat(salaryInput.replace(",", "."));
    if (Number.isNaN(n) || n < 0) {
      setFormError("Ingresá un sueldo válido (número ≥ 0).");
      return;
    }
    const parts = salaryForMonth.split("-").map(Number);
    const sy = parts[0];
    const sm = parts[1];
    if (!sy || !sm || sm < 1 || sm > 12) {
      setFormError("Elegí a qué mes corresponde el sueldo.");
      return;
    }
    setSavingSalary(true);
    try {
      await upsertMonthlyBudget({
        year: sy,
        month: sm,
        salary: n,
        salary_currency: salaryCurrency,
      });
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al guardar el sueldo");
    } finally {
      setSavingSalary(false);
    }
  }

  const currentMonthKey = `${periodYear}-${String(periodMonth).padStart(2, "0")}`;
  const isSalaryEditingCurrentMonth = salaryForMonth === currentMonthKey;
  const canPrefillFromSummary = isSalaryEditingCurrentMonth && summary != null;

  function prefillSalaryFromSummary() {
    if (!summary) return;
    setSalaryForMonth(currentMonthKey);
    if (summary.salary_usd != null) {
      setSalaryCurrency("USD");
      setSalaryInput(String(summary.salary_usd));
    } else {
      setSalaryCurrency("ARS");
      setSalaryInput(String(summary.salary));
    }
  }

  const salaryPreviewUsd = parseFloat(salaryInput.replace(",", "."));
  const salaryPreviewArs =
    salaryCurrency === "USD" && criptoVenta != null && !Number.isNaN(salaryPreviewUsd) && salaryPreviewUsd >= 0
      ? Math.round(salaryPreviewUsd * criptoVenta)
      : null;

  const extraPreviewN = parseFloat(extraAmount.replace(",", "."));
  const extraPreviewInBase =
    extraCurrency === "USD" &&
    baseCurrency === "ARS" &&
    criptoVenta != null &&
    Number.isFinite(extraPreviewN) &&
    extraPreviewN >= 0
      ? Math.round(extraPreviewN * criptoVenta)
      : null;
  const fixedPreviewN = parseFloat(fixedAmount.replace(",", "."));
  const fixedPreviewInBase =
    fixedCurrency === "USD" &&
    baseCurrency === "ARS" &&
    criptoVenta != null &&
    Number.isFinite(fixedPreviewN) &&
    fixedPreviewN >= 0
      ? Math.round(fixedPreviewN * criptoVenta)
      : null;

  const editFixedPreviewN = parseFloat(editFixedAmount.replace(",", "."));
  const editFixedPreviewInBase =
    editFixedCurrency === "USD" &&
    baseCurrency === "ARS" &&
    criptoVenta != null &&
    Number.isFinite(editFixedPreviewN) &&
    editFixedPreviewN >= 0
      ? Math.round(editFixedPreviewN * criptoVenta)
      : null;

  async function handleAddFixed(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const name = fixedName.trim();
    const amt = parseFloat(fixedAmount.replace(",", "."));
    if (!name) {
      setFormError("Nombre del gasto fijo obligatorio.");
      return;
    }
    if (Number.isNaN(amt) || amt < 0) {
      setFormError("Monto del gasto fijo inválido.");
      return;
    }
    let dueDay: number | undefined;
    if (fixedDueDay.trim() !== "") {
      const d = parseInt(fixedDueDay, 10);
      if (Number.isNaN(d) || d < 1 || d > 31) {
        setFormError("Día de vencimiento: usá un número entre 1 y 31.");
        return;
      }
      dueDay = d;
    }
    setAddingFixed(true);
    try {
      await createFixedExpense({
        name,
        amount: amt,
        amount_currency: fixedCurrency,
        ...(dueDay != null ? { due_day: dueDay } : {}),
      });
      setFixedName("");
      setFixedAmount("");
      setFixedDueDay("");
      setFixedCurrency("ARS");
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al agregar gasto fijo");
    } finally {
      setAddingFixed(false);
    }
  }

  async function handleSaveFixedEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!fixedEdit) return;
    setFormError(null);
    const name = editFixedName.trim();
    const amt = parseFloat(editFixedAmount.replace(",", "."));
    if (!name) {
      setFormError("Nombre del gasto fijo obligatorio.");
      return;
    }
    if (Number.isNaN(amt) || amt < 0) {
      setFormError("Monto inválido.");
      return;
    }
    let dueDay: number | null;
    if (editFixedDueDay.trim() === "") {
      dueDay = null;
    } else {
      const d = parseInt(editFixedDueDay, 10);
      if (Number.isNaN(d) || d < 1 || d > 31) {
        setFormError("Día de vencimiento: entre 1 y 31.");
        return;
      }
      dueDay = d;
    }
    setSavingFixedEdit(true);
    try {
      await updateFixedExpense(fixedEdit.id, {
        name,
        amount: amt,
        amount_currency: editFixedCurrency,
        due_day: dueDay,
        is_active: editFixedActive,
      });
      setFixedEdit(null);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSavingFixedEdit(false);
    }
  }

  function openOverrideModal(f: FixedExpense) {
    setOverrideTarget(f);
    // Pre-llenar con el override existente o el monto base del gasto fijo
    if (f.override_amount != null && f.override_original_currency) {
      setOverrideAmount(
        f.override_original_amount != null
          ? String(f.override_original_amount)
          : String(f.override_amount)
      );
      setOverrideCurrency(
        (f.override_original_currency as "USD" | "ARS" | "EUR") ?? "ARS"
      );
    } else {
      setOverrideAmount(
        f.original_amount != null && f.original_currency
          ? String(f.original_amount)
          : String(f.amount)
      );
      setOverrideCurrency(
        (f.original_currency as "USD" | "ARS" | "EUR" | null | undefined) ??
          (baseCurrency === "USD" || baseCurrency === "EUR" || baseCurrency === "ARS"
            ? baseCurrency
            : "ARS")
      );
    }
  }

  async function handleSaveOverride(e: React.FormEvent) {
    e.preventDefault();
    if (!overrideTarget) return;
    setFormError(null);
    const amt = parseFloat(overrideAmount.replace(",", "."));
    if (isNaN(amt) || amt < 0) {
      setFormError("Ingresá un monto válido.");
      return;
    }
    setSavingOverride(true);
    try {
      await upsertFixedExpenseAmountOverride(overrideTarget.id, {
        year: periodYear,
        month: periodMonth,
        amount: amt,
        amount_currency: overrideCurrency,
      });
      setOverrideTarget(null);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSavingOverride(false);
    }
  }

  async function handleDeleteOverride() {
    if (!overrideTarget) return;
    setSavingOverride(true);
    try {
      await deleteFixedExpenseAmountOverride(overrideTarget.id, periodYear, periodMonth);
      setOverrideTarget(null);
      await loadData();
    } catch {
      /* ignore */
    } finally {
      setSavingOverride(false);
    }
  }

  async function handleAddExtra(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const desc = extraDesc.trim();
    const amt = parseFloat(extraAmount.replace(",", "."));
    if (!desc) {
      setFormError("Descripción del ingreso extra obligatoria.");
      return;
    }
    if (Number.isNaN(amt) || amt < 0) {
      setFormError("Monto del ingreso extra inválido.");
      return;
    }
    setAddingExtra(true);
    try {
      await createExtraIncome({
        year: periodYear,
        month: periodMonth,
        description: desc,
        amount: amt,
        amount_currency: extraCurrency,
      });
      setExtraDesc("");
      setExtraAmount("");
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al agregar ingreso");
    } finally {
      setAddingExtra(false);
    }
  }

  async function confirmFinancesDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      if (deleteTarget.kind === "fixed") {
        await deleteFixedExpense(deleteTarget.item.id);
      } else {
        await deleteExtraIncome(deleteTarget.item.id);
      }
      await loadData();
      setDeleteTarget(null);
    } catch {
      /* ignore */
    } finally {
      setDeleteLoading(false);
    }
  }

  async function refreshBudgetOnly() {
    try {
      const [summaryData, statsData, expensesData, extraData, fixedData] = await Promise.all([
        getBudgetSummary(periodYear, periodMonth),
        getStats(periodYear, periodMonth),
        listExpenses(200, 0, periodYear, periodMonth),
        listExtraIncome(periodYear, periodMonth),
        listFixedExpenses(periodYear, periodMonth),
      ]);
      setSummary(summaryData);
      setStats(statsData);
      setExpenses(expensesData);
      setExtraList(extraData);
      setFixedList(fixedData);
    } catch {
      /* ignore */
    }
  }

  function handleExpenseCreated(expense: Expense) {
    setExpenses((prev) => [expense, ...prev]);
    refreshBudgetOnly();
  }

  function handleExpenseDeleted(id: number) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    refreshBudgetOnly();
  }

  function handleExpenseUpdated(updated: Expense) {
    setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    refreshBudgetOnly();
  }

  const topCategories = stats
    ? Object.entries(stats.by_category).sort(([, a], [, b]) => b - a).slice(0, 2)
    : [];

  const remainingPositive = summary ? summary.remaining >= 0 : true;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 text-slate-100">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Receipt className="w-7 h-7 text-blue-400" />
            Finanzas Personales
          </h1>
          <p className="text-slate-300 text-sm mt-0.5">
            Mes · sueldo · fijos · ingresos extra · gastos
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <span className="hidden sm:inline">Mes</span>
            <input
              type="month"
              value={`${periodYear}-${String(periodMonth).padStart(2, "0")}`}
              onChange={(e) => handleMonthInput(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            />
          </label>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {formError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {formError}
        </div>
      )}

      {summary && (
        <section className="rounded-2xl border border-slate-800/90 bg-slate-950/30 px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs text-slate-300">
                Disponible · {monthLabel(periodYear, periodMonth)}
              </p>
              <p
                className={`mt-0.5 text-3xl font-bold tracking-tight sm:text-4xl ${
                  remainingPositive ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {formatCurrency(summary.remaining, baseCurrency)}
              </p>
            </div>
            <p className="text-[11px] text-slate-300 max-w-xs text-right hidden sm:block">
              Ingresos − fijos pagados − gastos del mes
            </p>
          </div>
          <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-800/80 pt-4 text-sm">
            <div>
              <dt className="text-slate-300 text-xs">Sueldo</dt>
              <dd className="font-medium text-slate-100 tabular-nums">
                {formatCurrency(summary.salary, baseCurrency)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-300 text-xs">Extra</dt>
              <dd className="font-medium text-emerald-400/90 tabular-nums">
                +{formatCurrency(summary.total_extra_income, baseCurrency)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-300 text-xs">Fijos pagados</dt>
              <dd className="font-medium text-slate-300 tabular-nums">
                −{formatCurrency(summary.total_fixed_expenses, baseCurrency)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-300 text-xs">Gastos mes</dt>
              <dd className="font-medium text-slate-300 tabular-nums">
                −{formatCurrency(summary.total_variable_expenses, baseCurrency)}
              </dd>
            </div>
          </dl>
          {summary.salary_usd != null && summary.salary_cripto_rate_used != null && (
            <p className="mt-3 border-t border-slate-800/60 pt-3 text-[11px] leading-relaxed text-slate-300">
              Sueldo cargado: {formatUsd(summary.salary_usd)} · cripto venta{" "}
              {summary.salary_cripto_rate_used.toLocaleString("es-AR")} →{" "}
              <span className="text-slate-300">{formatCurrency(summary.salary, baseCurrency)}</span> en presupuesto
            </p>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-800/90 bg-slate-950/20 overflow-hidden">
        <div className="border-b border-slate-800/80 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-medium text-white">Datos del mes</h2>
          <p className="text-[11px] text-slate-300 mt-0.5">
            Sueldo e ingresos extra a la izquierda; gastos fijos a la derecha.
          </p>
        </div>

        <div className="p-4 sm:p-5 space-y-8">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
            {/* Sueldo */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-slate-300">Sueldo</h3>
                {canPrefillFromSummary && (
                  <button
                    type="button"
                    onClick={prefillSalaryFromSummary}
                    className="text-[11px] font-medium text-slate-300 hover:text-white underline decoration-slate-500/60 hover:decoration-slate-200 transition"
                    title="Cargar el sueldo ya guardado para editarlo"
                  >
                    Editar sueldo guardado
                  </button>
                )}
              </div>
              <div
                className="inline-flex rounded-lg bg-slate-900 p-0.5 ring-1 ring-slate-800"
                role="group"
                aria-label="Moneda del sueldo"
              >
                <button
                  type="button"
                  onClick={() => setSalaryCurrency("USD")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    salaryCurrency === "USD"
                      ? "bg-slate-700 text-white shadow-sm"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  USD
                </button>
                <button
                  type="button"
                  onClick={() => setSalaryCurrency("ARS")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    salaryCurrency === "ARS"
                      ? "bg-slate-700 text-white shadow-sm"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  ARS
                </button>
              </div>
              <form onSubmit={handleSaveSalary} className="space-y-2">
                <div>
                  <label
                    htmlFor="salary-for-month"
                    className="mb-1.5 block text-[11px] font-medium text-slate-300"
                  >
                    Este sueldo corresponde al mes
                  </label>
                  <input
                    id="salary-for-month"
                    type="month"
                    value={salaryForMonth}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) setSalaryForMonth(v);
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-300">
                    Ej.: si cobrás el 29 de marzo por el trabajo de <strong className="text-slate-300">abril</strong>,
                    elegí abril aquí. Puede ser distinto del mes que estés viendo arriba.
                  </p>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={salaryCurrency === "USD" ? "Monto en dólares" : "Monto en pesos"}
                  title="En USD se usa la venta del dólar cripto al guardar (DolarAPI)."
                  value={salaryInput}
                  onChange={(e) => setSalaryInput(e.target.value)}
                  className="w-full rounded-lg border-0 bg-slate-900/80 px-3 py-2.5 text-sm text-white ring-1 ring-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                {salaryCurrency === "USD" && criptoVenta != null && (
                  <p className="text-[11px] text-slate-300">
                    Cripto venta ~{criptoVenta.toLocaleString("es-AR")} ARS/USD
                    {salaryPreviewArs != null && (
                      <>
                        {" · "}
                        <span className="text-slate-300">
                          ≈ {formatCurrency(salaryPreviewArs, "ARS")} al tipo actual
                        </span>
                      </>
                    )}
                  </p>
                )}
                {salaryCurrency === "USD" && criptoVenta == null && (
                  <p className="text-[11px] text-amber-500/80">Sin cotización. Tocá Actualizar arriba.</p>
                )}
                <button
                  type="submit"
                  disabled={savingSalary}
                  className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50 sm:w-auto sm:px-6"
                >
                  {savingSalary
                    ? "Guardando…"
                    : canPrefillFromSummary && summary?.salary != null
                      ? "Actualizar sueldo"
                      : "Guardar sueldo"}
                </button>
              </form>

              <div className="border-t border-slate-800/80 pt-6 space-y-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-slate-300">
                  Ingresos extra <span className="font-normal normal-case text-slate-300">· solo este mes</span>
                </h3>
                <form onSubmit={handleAddExtra} className="flex flex-col gap-2">
                  <div>
                    <label htmlFor="extra-desc" className="sr-only">
                      Descripción
                    </label>
                    <input
                      id="extra-desc"
                      type="text"
                      placeholder="Qué ingresó (ej. aguinaldo)"
                      value={extraDesc}
                      onChange={(e) => setExtraDesc(e.target.value)}
                      className="w-full rounded-lg border-0 bg-slate-900/80 px-3 py-2.5 text-sm text-white ring-1 ring-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-medium text-slate-500">Moneda del monto</span>
                    <CurrencyToggle3 value={extraCurrency} onChange={setExtraCurrency} compact />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-nowrap sm:items-end">
                    <div className="min-w-0 flex-1">
                      <label htmlFor="extra-amt" className="sr-only">
                        Monto
                      </label>
                      <input
                        id="extra-amt"
                        type="text"
                        inputMode="decimal"
                        placeholder={extraCurrency === "USD" ? "Monto en USD" : "Monto"}
                        value={extraAmount}
                        onChange={(e) => setExtraAmount(e.target.value)}
                        className="w-full rounded-lg border-0 bg-slate-900/80 px-3 py-2.5 text-sm text-white ring-1 ring-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                      {extraCurrency === "USD" && baseCurrency === "ARS" && criptoVenta != null && extraPreviewInBase != null && (
                        <p className="mt-1 text-[10px] text-slate-500">
                          ≈ {formatCurrency(extraPreviewInBase, baseCurrency)} en presupuesto (cripto venta)
                        </p>
                      )}
                      {extraCurrency === "USD" && criptoVenta == null && (
                        <p className="mt-1 text-[10px] text-amber-500/80">Sin cotización. Tocá Actualizar arriba.</p>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={addingExtra}
                      className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-700 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-600 disabled:opacity-50 sm:w-auto sm:min-w-[7.5rem] sm:px-4"
                    >
                      <Plus className="h-4 w-4 opacity-80" />
                      Agregar
                    </button>
                  </div>
                </form>
                {extraList.length === 0 ? (
                  <p className="text-xs text-slate-300">Ninguno este mes.</p>
                ) : (
                  <ul className="divide-y divide-slate-800/90 text-sm sm:max-h-40 sm:overflow-y-auto">
                    {extraList.map((x) => (
                      <li key={x.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                        <span className="truncate text-slate-300">{x.description}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-right tabular-nums text-slate-300">
                            <span className="block">+{formatCurrency(x.amount, baseCurrency)}</span>
                            {x.original_currency &&
                              x.original_amount != null &&
                              x.original_currency !== baseCurrency && (
                                <span className="block text-[10px] font-normal text-slate-500">
                                  ({formatCurrency(x.original_amount, x.original_currency)})
                                </span>
                              )}
                          </span>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ kind: "extra", item: x })}
                            className="p-1.5 text-slate-300 hover:text-red-400"
                            aria-label="Eliminar ingreso extra"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Gastos fijos */}
            <div className="space-y-3 lg:border-l lg:border-slate-800/80 lg:pl-10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-slate-300">
                  Gastos fijos{" "}
                  <span className="font-normal normal-case text-slate-300">· cada mes</span>
                </h3>
                <button
                  type="button"
                  onClick={openCreditCardModal}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800/80 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Tarjetas (cuotas)
                </button>
              </div>
              <p className="text-[11px] leading-snug text-slate-300">
                Solo los que marques como <strong className="text-slate-300">pagados</strong> en{" "}
                {monthLabel(periodYear, periodMonth)} restan del resumen arriba. Podés pausar un fijo desde
                editar.
              </p>

              {(fixedList.some((f) => f.is_active) ||
                (summary?.credit_card_monthly_by_bank?.length ?? 0) > 0) && (
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-amber-500/90">
                      Sin pagar
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-amber-200/90">
                      {formatCurrency(fixedTotals.totalUnpaid, baseCurrency)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-500/90">
                      Pagados
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-300/90">
                      {formatCurrency(fixedTotals.totalPaid, baseCurrency)}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium text-slate-300">Ver:</span>
                {(
                  [
                    { id: "all" as const, label: "Todos" },
                    { id: "paid" as const, label: "Pagados" },
                    { id: "overdue" as const, label: "Vencidos" },
                  ] as const
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFixedListFilter(id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      fixedListFilter === id
                        ? "bg-blue-600/25 text-slate-100 ring-1 ring-blue-500/45 shadow-sm shadow-blue-500/10"
                        : "bg-slate-800/90 text-slate-300 ring-1 ring-slate-700/80 hover:bg-slate-700/90 hover:text-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleAddFixed} className="flex flex-col gap-2">
                <div className="min-w-0">
                  <label htmlFor="fixed-name" className="sr-only">
                    Concepto
                  </label>
                  <input
                    id="fixed-name"
                    type="text"
                    placeholder="Concepto (ej. alquiler)"
                    value={fixedName}
                    onChange={(e) => setFixedName(e.target.value)}
                    className="w-full rounded-lg border-0 bg-slate-900/80 px-3 py-2.5 text-sm text-white ring-1 ring-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-medium text-slate-500">Moneda del monto</span>
                  <CurrencyToggle3 value={fixedCurrency} onChange={setFixedCurrency} compact />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-nowrap sm:items-end">
                  <div className="w-full shrink-0 sm:w-[7.25rem]">
                    <label htmlFor="fixed-amt" className="sr-only">
                      Monto
                    </label>
                    <input
                      id="fixed-amt"
                      type="text"
                      inputMode="decimal"
                      placeholder={fixedCurrency === "USD" ? "USD" : "Monto"}
                      value={fixedAmount}
                      onChange={(e) => setFixedAmount(e.target.value)}
                      className="w-full rounded-lg border-0 bg-slate-900/80 px-3 py-2.5 text-sm text-white ring-1 ring-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                    {fixedCurrency === "USD" && baseCurrency === "ARS" && criptoVenta != null && fixedPreviewInBase != null && (
                      <p className="mt-1 text-[10px] text-slate-500">
                        ≈ {formatCurrency(fixedPreviewInBase, baseCurrency)} en presupuesto
                      </p>
                    )}
                    {fixedCurrency === "USD" && criptoVenta == null && (
                      <p className="mt-1 text-[10px] text-amber-500/80">Sin cotización. Actualizá arriba.</p>
                    )}
                  </div>
                  <div className="min-w-0 w-full flex-1 sm:min-w-[11rem] sm:max-w-[16rem]">
                    <label htmlFor="fixed-due" className="sr-only">
                      Vencimiento
                    </label>
                    <DayOfMonthPicker
                      id="fixed-due"
                      value={fixedDueDay}
                      onChange={setFixedDueDay}
                      alignMonth={{ year: periodYear, month: periodMonth }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={addingFixed}
                    className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-700 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-600 disabled:opacity-50 sm:w-auto sm:min-w-[7.5rem] sm:px-5"
                  >
                    <Plus className="h-4 w-4 opacity-80" />
                    Agregar
                  </button>
                </div>
              </form>

              {fixedList.length === 0 &&
              (summary?.credit_card_monthly_by_bank?.length ?? 0) === 0 ? (
                <p className="text-xs text-slate-300">Ninguno cargado.</p>
              ) : displayedFixedSectionRows.length === 0 ? (
                <p className="text-xs text-slate-300">Ninguno coincide con este filtro.</p>
              ) : (
                <ul className="max-h-none divide-y divide-slate-800/90 text-sm sm:max-h-52 sm:overflow-y-auto">
                  {displayedFixedSectionRows.map((entry) => {
                    if (entry.kind === "cc") {
                      const row = entry.row;
                      const paidRow = row.paid ?? false;
                      const urgency = ccDueUrgency(row, periodYear, periodMonth);
                      const leftCc = daysUntilCcDue(row, periodYear, periodMonth);
                      const ccMsg =
                        urgency && leftCc != null ? formatUrgencyFromDaysLeft(leftCc) : "";
                      const soonRow = urgency === "soon" && !paidRow;
                      const overdueRow = urgency === "overdue" && !paidRow;
                      const isUsd = row.currency_group === "USD";

                      return (
                        <li
                          key={`cc-${row.bank_key}`}
                          className={`flex flex-wrap items-center gap-2 py-2.5 pl-1 first:pt-0 sm:gap-3 ${
                            paidRow
                              ? "rounded-lg bg-emerald-500/[0.06] ring-1 ring-emerald-500/15"
                              : ""
                          } ${
                            soonRow
                              ? "rounded-lg bg-amber-500/[0.07] ring-1 ring-amber-500/30"
                              : ""
                          } ${
                            overdueRow
                              ? "rounded-lg bg-red-500/[0.06] ring-1 ring-red-500/30"
                              : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={row.paid}
                            title="Pagado este mes"
                            onChange={async (e) => {
                              try {
                                await setCreditCardPeriodPaid({
                                  year: periodYear,
                                  month: periodMonth,
                                  bank: row.bank_key,
                                  paid: e.target.checked,
                                });
                                await loadData();
                              } catch {
                                /* ignore */
                              }
                            }}
                            className="h-4 w-4 shrink-0 rounded border-slate-600 accent-emerald-500 focus:ring-emerald-500/40"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-start gap-1.5">
                              {soonRow && (
                                <AlertCircle
                                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
                                  aria-hidden
                                />
                              )}
                              {overdueRow && (
                                <AlertCircle
                                  className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
                                  aria-hidden
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <div
                                  className={`truncate font-medium ${
                                    paidRow ? "text-emerald-100/95" : "text-slate-200"
                                  }`}
                                >
                                  {row.label}
                                </div>
                                <p className="text-[11px] text-slate-400">{formatCcDueSubtitle(row)}</p>
                                {soonRow && ccMsg && (
                                  <p className="mt-0.5 text-[11px] font-medium text-amber-400">
                                    {ccMsg}
                                  </p>
                                )}
                                {overdueRow && ccMsg && (
                                  <p className="mt-0.5 text-[11px] font-medium text-red-400">
                                    {ccMsg}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                          <span className="shrink-0 text-right tabular-nums">
                            {isUsd ? (
                              <>
                                <span className={`block ${paidRow ? "text-emerald-200/90" : "text-slate-300"}`}>
                                  {formatCurrency(row.amount, baseCurrency)}
                                </span>
                                <span className="block text-[11px] text-blue-400/80">
                                  USD {new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(row.amount_usd!)}
                                </span>
                              </>
                            ) : (
                              <span className={paidRow ? "text-emerald-200/90" : "text-slate-300"}>
                                {formatCurrency(row.amount, baseCurrency)}
                              </span>
                            )}
                          </span>
                          <span className="inline-flex shrink-0 gap-0" aria-hidden>
                            <span className="p-1.5 opacity-0">
                              <Pencil className="h-4 w-4" />
                            </span>
                            <span className="p-1.5 opacity-0">
                              <Trash2 className="h-4 w-4" />
                            </span>
                          </span>
                        </li>
                      );
                    }
                    const f = entry.item;
                    const urgency = fixedDueUrgency(f, periodYear, periodMonth);
                    const msg = urgency ? urgencyMessage(f, periodYear, periodMonth) : "";
                    const paidRow = f.is_active && f.paid_this_period;
                    const soonRow = urgency === "soon" && !paidRow;
                    const overdueRow = urgency === "overdue" && !paidRow;
                    return (
                    <li
                      key={f.id}
                      className={`flex flex-wrap items-center gap-2 py-2.5 pl-1 first:pt-0 sm:gap-3 ${
                        paidRow
                          ? "rounded-lg bg-emerald-500/[0.06] ring-1 ring-emerald-500/15"
                          : ""
                      } ${
                        soonRow
                          ? "rounded-lg bg-amber-500/[0.07] ring-1 ring-amber-500/30"
                          : ""
                      } ${
                        overdueRow
                          ? "rounded-lg bg-red-500/[0.06] ring-1 ring-red-500/30"
                          : ""
                      }`}
                    >
                      {f.is_active ? (
                        <input
                          type="checkbox"
                          checked={f.paid_this_period}
                          title="Pagado este mes"
                          onChange={async (e) => {
                            try {
                              await setFixedExpensePaidPeriod(f.id, {
                                year: periodYear,
                                month: periodMonth,
                                paid: e.target.checked,
                              });
                              await loadData();
                            } catch {
                              /* ignore */
                            }
                          }}
                          className="h-4 w-4 shrink-0 rounded border-slate-600 accent-emerald-500 focus:ring-emerald-500/40"
                        />
                      ) : (
                        <span
                          className="inline-block w-4 shrink-0 text-center text-[10px] text-slate-300"
                          title="Pausado"
                        >
                          ⏸
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-start gap-1.5">
                          {soonRow && (
                            <AlertCircle
                              className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
                              aria-hidden
                            />
                          )}
                          {overdueRow && (
                            <AlertCircle
                              className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
                              aria-hidden
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div
                              className={`truncate font-medium ${
                                f.is_active
                                  ? f.paid_this_period
                                    ? "text-emerald-100/95"
                                    : "text-slate-200"
                                  : "text-slate-300 line-through"
                              }`}
                            >
                              {f.name}
                            </div>
                            {f.due_day != null && f.due_day >= 1 && f.due_day <= 31 && (
                              <p className="text-[11px] text-slate-300">
                                Vence el {f.due_day} de cada mes
                              </p>
                            )}
                            {soonRow && msg && (
                              <p className="mt-0.5 text-[11px] font-medium text-amber-400">{msg}</p>
                            )}
                            {overdueRow && msg && (
                              <p className="mt-0.5 text-[11px] font-medium text-red-400">{msg}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-right tabular-nums ${
                          paidRow ? "text-emerald-200/90" : "text-slate-300"
                        }`}
                      >
                        {f.override_amount != null ? (
                          <>
                            <span
                              className="block font-medium text-amber-300"
                              title="Monto personalizado para este mes"
                            >
                              {formatCurrency(f.override_amount, baseCurrency)}
                            </span>
                            {f.override_original_currency &&
                              f.override_original_amount != null &&
                              f.override_original_currency !== baseCurrency && (
                                <span className="block text-[10px] font-normal text-amber-400/70">
                                  ({formatCurrency(f.override_original_amount, f.override_original_currency)})
                                </span>
                              )}
                            <span className="block text-[10px] font-normal text-slate-500 line-through">
                              {formatCurrency(f.amount, baseCurrency)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="block">{formatCurrency(f.amount, baseCurrency)}</span>
                            {f.original_currency &&
                              f.original_amount != null &&
                              f.original_currency !== baseCurrency && (
                                <span className="block text-[10px] font-normal text-slate-500">
                                  ({formatCurrency(f.original_amount, f.original_currency)})
                                </span>
                              )}
                          </>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => openOverrideModal(f)}
                        className={`shrink-0 p-1.5 transition ${
                          f.override_amount != null
                            ? "text-amber-400 hover:text-amber-300"
                            : "text-slate-400 hover:text-amber-400"
                        }`}
                        title={
                          f.override_amount != null
                            ? "Modificar monto de este mes"
                            : "Ajustar monto solo para este mes"
                        }
                        aria-label="Ajustar monto para este mes"
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFixedEdit(f);
                          setEditFixedName(f.name);
                          setEditFixedAmount(
                            f.original_amount != null && f.original_currency
                              ? String(f.original_amount)
                              : String(f.amount)
                          );
                          setEditFixedCurrency(
                            (f.original_currency as "USD" | "ARS" | "EUR" | null | undefined) ??
                              (baseCurrency === "USD" || baseCurrency === "EUR" || baseCurrency === "ARS"
                                ? baseCurrency
                                : "ARS")
                          );
                          setEditFixedDueDay(
                            f.due_day != null && f.due_day >= 1 ? String(f.due_day) : ""
                          );
                          setEditFixedActive(f.is_active);
                        }}
                        className="shrink-0 p-1.5 text-slate-300 hover:text-blue-400"
                        aria-label="Editar gasto fijo"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ kind: "fixed", item: f })}
                        className="shrink-0 p-1.5 text-slate-300 hover:text-red-400"
                        aria-label="Eliminar gasto fijo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniStat label="Gastos del mes" value={formatCurrency(stats.total_month_base, baseCurrency)} accent="blue" />
          <MiniStat label="Transacciones" value={String(stats.total_expenses)} accent="emerald" />
          {topCategories.map(([cat, total]) => (
            <MiniStat key={cat} label={cat} value={formatCurrency(total, baseCurrency)} accent="purple" />
          ))}
        </div>
      )}

      <div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Receipt className="h-4 w-4 text-slate-300" />
            Gastos de {monthLabel(periodYear, periodMonth)}
            <span className="text-xs font-normal text-slate-300">
              {loading ? "Cargando…" : `· ${expenses.length} ${expenses.length === 1 ? "registro" : "registros"}`}
            </span>
          </h2>
          <button
            type="button"
            onClick={() => setExpenseModal("new")}
            className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            Nuevo gasto
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-32 sm:h-12 rounded-2xl bg-slate-800/50 animate-pulse border border-slate-700/30"
              />
            ))}
          </div>
        ) : expenses.length === 0 ? (
          <div className="text-center py-16 text-slate-300">
            <Receipt className="w-12 h-12 opacity-20 mx-auto mb-3" />
            <p className="text-base">No hay gastos en este mes.</p>
            <p className="text-sm mt-1">Usá &quot;Nuevo gasto&quot; o el asistente IA.</p>
          </div>
        ) : (
          <>
            <div className="md:hidden space-y-3">
              {expenses.map((expense) => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  baseCurrency={baseCurrency}
                  onDeleted={handleExpenseDeleted}
                  onEdit={(e) => setExpenseModal(e)}
                />
              ))}
            </div>
            <div className="hidden md:block">
              <ExpenseTable
                expenses={expenses}
                baseCurrency={baseCurrency}
                onDeleted={handleExpenseDeleted}
                onEdit={(e) => setExpenseModal(e)}
                onRowClick={(e) => setDetailExpense(e)}
              />
            </div>
          </>
        )}
      </div>

      {detailExpense != null && (
        <ExpenseDetailModal
          expense={detailExpense}
          baseCurrency={baseCurrency}
          onClose={() => setDetailExpense(null)}
          onEdit={(e) => setExpenseModal(e)}
        />
      )}

      {expenseModal != null && (
        <ExpenseModal
          expenseToEdit={expenseModal === "new" ? null : expenseModal}
          onClose={() => setExpenseModal(null)}
          onSaved={(e) => {
            if (expenseModal === "new") handleExpenseCreated(e);
            else handleExpenseUpdated(e);
          }}
        />
      )}

      {fixedEdit && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            aria-label="Cerrar"
            onClick={() => !savingFixedEdit && setFixedEdit(null)}
          />
          <div
            className="relative z-10 flex max-h-[min(520px,90dvh)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-slate-800 bg-[#1e293b] shadow-2xl sm:rounded-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fixed-edit-title"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-3">
              <h2 id="fixed-edit-title" className="text-base font-semibold text-white">
                Editar gasto fijo
              </h2>
              <button
                type="button"
                disabled={savingFixedEdit}
                onClick={() => setFixedEdit(null)}
                className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={handleSaveFixedEdit}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5"
            >
              <div>
                <label htmlFor="edit-fixed-name" className="mb-1.5 block text-xs font-medium text-slate-300">
                  Concepto
                </label>
                <input
                  id="edit-fixed-name"
                  type="text"
                  value={editFixedName}
                  onChange={(e) => setEditFixedName(e.target.value)}
                  className="w-full rounded-xl border border-slate-600 bg-slate-800/80 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  required
                />
              </div>
              <div>
                <label htmlFor="edit-fixed-amt" className="mb-1.5 block text-xs font-medium text-slate-300">
                  Monto (se convierte a {baseCurrency})
                </label>
                <div className="mb-2">
                  <CurrencyToggle3 value={editFixedCurrency} onChange={setEditFixedCurrency} compact />
                </div>
                <input
                  id="edit-fixed-amt"
                  type="text"
                  inputMode="decimal"
                  value={editFixedAmount}
                  onChange={(e) => setEditFixedAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-600 bg-slate-800/80 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  required
                />
                {editFixedCurrency === "USD" && baseCurrency === "ARS" && criptoVenta != null && editFixedPreviewInBase != null && (
                  <p className="mt-1.5 text-[10px] text-slate-500">
                    ≈ {formatCurrency(editFixedPreviewInBase, baseCurrency)} en presupuesto
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="edit-fixed-due" className="mb-1.5 block text-xs font-medium text-slate-300">
                  Vencimiento (día del mes)
                </label>
                <DayOfMonthPicker
                  id="edit-fixed-due"
                  value={editFixedDueDay}
                  onChange={setEditFixedDueDay}
                  alignMonth={{ year: periodYear, month: periodMonth }}
                  triggerClassName="rounded-xl !ring-0 border border-slate-600 bg-slate-800/80 focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={editFixedActive}
                  onChange={(e) => setEditFixedActive(e.target.checked)}
                  className="rounded border-slate-600"
                />
                Activo (aparece en la lista y podés marcarlo pagado)
              </label>
              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={savingFixedEdit}
                  onClick={() => setFixedEdit(null)}
                  className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingFixedEdit}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {savingFixedEdit ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {overrideTarget && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            aria-label="Cerrar"
            onClick={() => !savingOverride && setOverrideTarget(null)}
          />
          <div
            className="relative z-10 flex max-h-[min(480px,90dvh)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-slate-800 bg-[#1e293b] shadow-2xl sm:rounded-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="override-modal-title"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-3">
              <div className="min-w-0">
                <h2 id="override-modal-title" className="text-base font-semibold text-white">
                  Monto para este mes
                </h2>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {overrideTarget.name} · {new Date(periodYear, periodMonth - 1).toLocaleString("es-AR", { month: "long", year: "numeric" })}
                </p>
              </div>
              <button
                type="button"
                disabled={savingOverride}
                onClick={() => setOverrideTarget(null)}
                className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={handleSaveOverride}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5"
            >
              <p className="text-xs text-slate-400">
                Modificá el monto <span className="font-medium text-white">solo para este mes</span> sin afectar los demás meses.
                El monto base del gasto fijo queda igual.
              </p>
              <div>
                <label htmlFor="override-amt" className="mb-1.5 block text-xs font-medium text-slate-300">
                  Monto de este mes (se convierte a {baseCurrency})
                </label>
                <div className="mb-2">
                  <CurrencyToggle3 value={overrideCurrency} onChange={setOverrideCurrency} compact />
                </div>
                <input
                  id="override-amt"
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={overrideAmount}
                  onChange={(e) => setOverrideAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-600 bg-slate-800/80 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  required
                  placeholder={`Monto en ${overrideCurrency}`}
                />
              </div>
              {formError && (
                <p className="rounded-lg bg-red-900/40 px-3 py-2 text-xs text-red-300">{formError}</p>
              )}
              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
                <div className="flex gap-2">
                  {overrideTarget.override_amount != null && (
                    <button
                      type="button"
                      disabled={savingOverride}
                      onClick={handleDeleteOverride}
                      className="rounded-xl border border-slate-600 px-3 py-2.5 text-xs font-medium text-red-400 hover:bg-red-900/20 disabled:opacity-50"
                    >
                      Restablecer monto base
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={savingOverride}
                    onClick={() => setOverrideTarget(null)}
                    className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={savingOverride}
                  className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  {savingOverride ? "Guardando…" : "Guardar para este mes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {ccModalOpen &&
        ccPortalMounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex min-h-0 items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
            role="presentation"
          >
            <button
              type="button"
              className="absolute inset-0 min-h-[100dvh] w-full cursor-default bg-slate-950/75 backdrop-blur-md"
              aria-label="Cerrar"
              onClick={() => setCcModalOpen(false)}
            />
            <div
              className="relative z-10 flex h-[min(560px,88dvh)] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-600/70 bg-[#1e293b]/95 shadow-2xl shadow-black/50 ring-1 ring-slate-700/40"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cc-modal-title"
            >
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-700/60 bg-slate-900/40 px-4 py-3.5 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-500/25">
                    <CreditCard className="h-5 w-5 text-violet-300" />
                  </div>
                  <div className="min-w-0">
                    <h2 id="cc-modal-title" className="text-base font-semibold text-white">
                      Tarjetas de crédito
                    </h2>
                    <p className="text-[11px] text-slate-300">
                      {monthLabel(periodYear, periodMonth)} · cuotas con vencimiento este mes
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCcModalOpen(false)}
                  className="rounded-lg p-2 text-slate-300 transition hover:bg-slate-700/80 hover:text-white"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5 [-webkit-overflow-scrolling:touch]">
                {ccLoading ? (
                  <p className="text-sm text-slate-300">Cargando…</p>
                ) : !ccDetail || ccDetail.banks.length === 0 ? (
                  <p className="text-sm leading-relaxed text-slate-300">
                    No hay cuotas de tarjeta registradas para este mes (o todas son en 1 pago).
                  </p>
                ) : (
                  <div className="space-y-5">
                    {ccDetail.banks.map((b) => (
                      <div key={b.bank} className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2 px-0.5">
                          <h3 className="text-sm font-semibold tracking-tight text-slate-100">
                            {b.bank}
                          </h3>
                          <div className="flex flex-col items-end gap-0.5">
                            {b.total_ars_only != null && b.total_ars_only > 0 && (
                              <span className="text-sm font-semibold tabular-nums text-emerald-300/95">
                                {formatCurrency(b.total_ars_only, ccDetail.base_currency)}
                              </span>
                            )}
                            {b.total_usd_this_month != null && b.total_usd_this_month > 0 && (
                              <span className="text-sm font-semibold tabular-nums text-blue-300/90">
                                USD {new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(b.total_usd_this_month)}
                              </span>
                            )}
                            {(!b.total_ars_only || b.total_ars_only === 0) && (!b.total_usd_this_month || b.total_usd_this_month === 0) && (
                              <span className="text-sm font-semibold tabular-nums text-emerald-300/95">
                                {formatCurrency(b.total_due_this_month, ccDetail.base_currency)}
                              </span>
                            )}
                          </div>
                        </div>
                        {(() => {
                          const arsP = b.purchases.filter((p) => p.original_currency !== "USD");
                          const usdP = b.purchases.filter((p) => p.original_currency === "USD");
                          const hasBoth = arsP.length > 0 && usdP.length > 0;

                          const renderPurchase = (p: typeof b.purchases[0]) => (
                            <li
                              key={`${p.expense_id}-${p.current_installment_index}`}
                              className="rounded-xl bg-slate-800/50 p-3 ring-1 ring-slate-700/50 transition hover:ring-slate-600/60"
                            >
                              <p className="font-medium text-slate-100">{p.description}</p>
                              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
                                Cuota {p.current_installment_index} de {p.installments} ·{" "}
                                {formatCurrency(p.installment_amount, ccDetail.base_currency)} este mes ·{" "}
                                {p.installments_remaining_after} restantes después
                              </p>
                              {p.original_currency === "USD" && p.original_installment_amount != null && p.exchange_rate_used != null && (
                                <p className="mt-1 text-[11px] tabular-nums text-blue-400/80">
                                  USD {new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(p.original_installment_amount)}{" "}
                                  <span className="text-slate-500">×</span>{" "}
                                  {new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(p.exchange_rate_used)}{" "}
                                  <span className="text-slate-500">=</span>{" "}
                                  {formatCurrency(p.installment_amount, ccDetail.base_currency)}
                                </p>
                              )}
                              <p className="mt-1.5 text-[11px] text-slate-400">
                                Total compra:{" "}
                                {formatCurrency(p.total_base, ccDetail.base_currency)} ·{" "}
                                {new Date(p.purchase_date).toLocaleDateString("es-AR")}
                              </p>
                            </li>
                          );

                          const separator = (label: string) => (
                            <div className="flex items-center gap-2 py-0.5">
                              <span className="h-px flex-1 bg-slate-700/60" />
                              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                                {label}
                              </span>
                              <span className="h-px flex-1 bg-slate-700/60" />
                            </div>
                          );

                          return (
                            <div className="space-y-2">
                              {hasBoth && separator("Gastos en pesos")}
                              {arsP.length > 0 && (
                                <ul className="space-y-2">{arsP.map(renderPurchase)}</ul>
                              )}
                              {hasBoth && usdP.length > 0 && separator("Gastos en dólares")}
                              {usdP.length > 0 && (
                                <ul className="space-y-2">{usdP.map(renderPurchase)}</ul>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={
          deleteTarget?.kind === "fixed"
            ? "Eliminar gasto fijo"
            : deleteTarget?.kind === "extra"
              ? "Eliminar ingreso extra"
              : ""
        }
        message={
          deleteTarget?.kind === "fixed"
            ? `¿Eliminar “${deleteTarget.item.name}” (${formatCurrency(deleteTarget.item.amount, baseCurrency)})? Se borrará la plantilla y los registros de pago por mes. Esta acción no se puede deshacer.`
            : deleteTarget?.kind === "extra"
              ? `¿Eliminar el ingreso extra “${deleteTarget.item.description}” (${formatCurrency(deleteTarget.item.amount, baseCurrency)})? Esta acción no se puede deshacer.`
              : ""
        }
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleteLoading}
        onConfirm={confirmFinancesDelete}
        onCancel={() => !deleteLoading && setDeleteTarget(null)}
      />

      <AIChatWidget
        onExpenseCreated={(e) => {
          if ("trip_id" in e) return;
          handleExpenseCreated(e);
        }}
        onExpenseUpdated={(e) => handleExpenseUpdated(e)}
        onExpenseDeleted={handleExpenseDeleted}
      />
    </div>
  );
}

function MiniStat({ label, value, accent }: {
  label: string; value: string; accent: "blue" | "emerald" | "purple";
}) {
  const cls = {
    blue: "ring-blue-500/15",
    emerald: "ring-emerald-500/15",
    purple: "ring-purple-500/15",
  };
  return (
    <div className={`rounded-xl bg-slate-900/40 px-3 py-2.5 ring-1 ring-slate-800/80 ${cls[accent]}`}>
      <p className="text-[11px] text-slate-300 truncate">{label}</p>
      <p className="text-base font-semibold text-white mt-0.5 truncate">{value}</p>
    </div>
  );
}
