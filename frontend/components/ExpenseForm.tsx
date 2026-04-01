"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, PlusCircle, Save } from "lucide-react";
import { createExpense, previewExpenseInBase, updateExpense } from "@/lib/api";
import { useUser } from "@/lib/UserContext";
import {
  normalizeCreditCardBanks,
  type CreditCardBankEntry,
  type Expense,
  type ExpenseBasePreview,
  type ExpenseCategory,
  type ExpenseUpdate,
  type PaymentMethod,
} from "@/lib/types";
import CategorySelect from "@/components/CategorySelect";
import AddCreditCardBankModal from "@/components/AddCreditCardBankModal";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "ARS" ? "ARS" : currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

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

const CURRENCIES = [
  { code: "ARS", label: "🇦🇷 ARS" },
  { code: "USD", label: "🇺🇸 USD" },
  { code: "EUR", label: "🇪🇺 EUR" },
];

const PAYMENT_METHODS: PaymentMethod[] = [
  "Efectivo",
  "Transferencia",
  "Tarjeta de crédito",
  "Tarjeta de débito",
  "Mercado Pago / QR",
  "Otro",
];

function getExpenseFormDefaults(expenseToEdit: Expense | null | undefined) {
  if (!expenseToEdit) {
    return {
      description: "",
      amount: "",
      currency: "ARS",
      category: "Otro" as ExpenseCategory,
      paymentMethod: "Otro" as PaymentMethod,
      creditCardBank: "",
      creditInstallments: "1",
    };
  }
  return {
    description: expenseToEdit.description,
    amount: String(expenseToEdit.original_amount),
    currency: expenseToEdit.original_currency,
    category: expenseToEdit.category,
    paymentMethod: (expenseToEdit.payment_method ?? "Otro") as PaymentMethod,
    creditCardBank: expenseToEdit.credit_card_bank ?? "",
    creditInstallments: String(expenseToEdit.credit_installments ?? 1),
  };
}

function parseAmountInput(s: string): number {
  const n = parseFloat(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function amountsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

interface Props {
  /** Gasto a editar; si no hay, modo alta. */
  expenseToEdit?: Expense | null;
  onSuccess: (expense: Expense) => void;
  /** En edición sin cambios: cerrar sin llamar al API. */
  onIdleClose?: () => void;
  /** Sin contenedor tipo tarjeta ni título (p. ej. dentro de un modal). */
  plain?: boolean;
}

export default function ExpenseForm({
  expenseToEdit = null,
  onSuccess,
  onIdleClose,
  plain = false,
}: Props) {
  const isEdit = expenseToEdit != null;
  const { user } = useUser();

  const [description, setDescription] = useState(() =>
    getExpenseFormDefaults(expenseToEdit).description,
  );
  const [amount, setAmount] = useState(() => getExpenseFormDefaults(expenseToEdit).amount);
  const [currency, setCurrency] = useState(() => getExpenseFormDefaults(expenseToEdit).currency);
  const [category, setCategory] = useState<ExpenseCategory>(
    () => getExpenseFormDefaults(expenseToEdit).category,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    () => getExpenseFormDefaults(expenseToEdit).paymentMethod,
  );
  const [creditCardBank, setCreditCardBank] = useState(
    () => getExpenseFormDefaults(expenseToEdit).creditCardBank,
  );
  const [creditInstallments, setCreditInstallments] = useState(
    () => getExpenseFormDefaults(expenseToEdit).creditInstallments,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [basePreview, setBasePreview] = useState<ExpenseBasePreview | null>(null);
  const [basePreviewLoading, setBasePreviewLoading] = useState(false);
  const [addBankModalOpen, setAddBankModalOpen] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const baseCurrency = (user?.base_currency ?? "ARS").toUpperCase();
  const creditBanks = normalizeCreditCardBanks(user?.credit_card_banks ?? []);

  useEffect(() => {
    const d = getExpenseFormDefaults(expenseToEdit);
    setDescription(d.description);
    setAmount(d.amount);
    setCurrency(d.currency);
    setCategory(d.category);
    setPaymentMethod(d.paymentMethod);
    setCreditCardBank(d.creditCardBank);
    setCreditInstallments(d.creditInstallments);
    setError("");
  }, [expenseToEdit]);

  useEffect(() => {
    if (expenseToEdit) return;
    const bc = user?.base_currency?.toUpperCase();
    if (bc && CURRENCIES.some((c) => c.code === bc)) {
      setCurrency(bc);
    }
  }, [expenseToEdit, user?.base_currency]);

  useEffect(() => {
    if (currency.toUpperCase() === baseCurrency) {
      setBasePreview(null);
      setBasePreviewLoading(false);
      return;
    }
    const n = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setBasePreview(null);
      setBasePreviewLoading(false);
      return;
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      setBasePreviewLoading(true);
      try {
        const p = await previewExpenseInBase(n, currency);
        if (!cancelled) setBasePreview(p);
      } catch {
        if (!cancelled) setBasePreview(null);
      } finally {
        if (!cancelled) setBasePreviewLoading(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [amount, currency, baseCurrency]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAttemptedSubmit(true);
    if (!description.trim() || !amount) return;
    if (paymentMethod === "Tarjeta de crédito" && !creditCardBank.trim()) return;

    setError("");
    setLoading(true);
    try {
      if (isEdit && expenseToEdit) {
        const patch: ExpenseUpdate = {};
        if (description.trim() !== expenseToEdit.description) patch.description = description.trim();
        const amountNum = parseAmountInput(amount);
        if (Number.isFinite(amountNum) && !amountsEqual(amountNum, expenseToEdit.original_amount)) {
          patch.original_amount = amountNum;
        }
        if (currency !== expenseToEdit.original_currency) patch.original_currency = currency;
        if (category !== expenseToEdit.category) patch.category = category;
        if (paymentMethod !== (expenseToEdit.payment_method ?? "Otro"))
          patch.payment_method = paymentMethod;

        if (paymentMethod === "Tarjeta de crédito") {
          const trimmed = creditCardBank.trim();
          const prev = (expenseToEdit.credit_card_bank ?? "").trim();
          if (trimmed !== prev) patch.credit_card_bank = trimmed || null;
          const n = Math.min(60, Math.max(1, parseInt(creditInstallments, 10) || 1));
          if (n !== (expenseToEdit.credit_installments ?? 1)) {
            patch.credit_installments = n;
          }
        }

        if (Object.keys(patch).length === 0) {
          onIdleClose?.();
          setLoading(false);
          return;
        }

        const updated = await updateExpense(expenseToEdit.id, patch);
        onSuccess(updated);
      } else {
        const inst = Math.min(
          60,
          Math.max(1, parseInt(creditInstallments, 10) || 1)
        );
        const createAmount = parseAmountInput(amount);
        if (!Number.isFinite(createAmount) || createAmount <= 0) {
          setError("Ingresá un monto válido");
          setLoading(false);
          return;
        }
        const expense = await createExpense({
          description: description.trim(),
          category,
          original_amount: createAmount,
          original_currency: currency,
          payment_method: paymentMethod,
          ...(paymentMethod === "Tarjeta de crédito"
            ? {
                credit_card_bank: creditCardBank.trim() || null,
                credit_installments: inst,
              }
            : {}),
        });
        onSuccess(expense);
        setDescription("");
        setAmount("");
        setCategory("Otro");
        setPaymentMethod("Otro");
        setCreditCardBank("");
        setCreditInstallments("1");
        setAttemptedSubmit(false);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : isEdit
            ? "Error al guardar"
            : "Error al registrar",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={
        plain
          ? "space-y-4"
          : "rounded-2xl border border-slate-700 bg-slate-800/60 p-5"
      }
    >
      {!plain && (
        <h3 className="mb-4 flex items-center gap-2 font-semibold text-white">
          <PlusCircle className="h-5 w-5 text-blue-400" />
          Registrar gasto manual
        </h3>
      )}

      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">
            Descripción
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej: Almuerzo, Uber, Ropa…"
            required
            className="w-full rounded-xl border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="w-full max-w-md">
          <label className="mb-1.5 block text-xs font-medium text-slate-400">
            Monto
          </label>
          <div className="flex min-w-0 gap-2">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="min-w-[6.75rem] w-[7rem] shrink-0 rounded-xl border border-slate-600 bg-slate-700 px-2 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-w-[7.25rem] sm:w-[7.5rem] sm:text-sm"
              aria-label="Moneda"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              required
              className="min-w-0 flex-1 rounded-xl border border-slate-600 bg-slate-700 px-2 py-2.5 text-sm text-white placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {currency.toUpperCase() !== baseCurrency && (
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              {basePreviewLoading ? (
                "Consultando dólar cripto…"
              ) : basePreview ? (
                <>
                  En tu resumen se sumará{" "}
                  <span className="font-medium text-slate-300">
                    {formatMoney(basePreview.base_amount, basePreview.base_currency)}
                  </span>{" "}
                  ({basePreview.base_currency}), usando dólar cripto (venta) al guardar.
                </>
              ) : (
                "No se pudo obtener el dólar cripto ahora; el monto en tu moneda base se calculará al guardar."
              )}
            </p>
          )}
        </div>

        <div className="w-full">
          <label className="mb-1.5 block text-xs font-medium text-slate-400">
            Categoría
          </label>
          <CategorySelect value={category} options={CATEGORIES} onChange={setCategory} />
        </div>

        <div className="w-full">
          <label className="mb-1.5 block text-xs font-medium text-slate-400">
            Medio de pago
          </label>
          <select
            value={paymentMethod}
            onChange={(e) => {
              const m = e.target.value as PaymentMethod;
              setPaymentMethod(m);
              if (m !== "Tarjeta de crédito") {
                setCreditCardBank("");
                setCreditInstallments("1");
              }
            }}
            className="w-full rounded-xl border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {paymentMethod === "Tarjeta de crédito" && (
          <div className="w-full space-y-3">
            {/* Banco — requerido */}
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="block text-xs font-medium text-slate-400">
                  Banco de la tarjeta <span className="text-red-400">*</span>
                </label>
                {/* Botón agregar banco siempre visible cuando ya hay bancos */}
                {creditBanks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAddBankModalOpen(true)}
                    className="flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition"
                  >
                    <Plus className="h-3 w-3" />
                    Agregar banco
                  </button>
                )}
              </div>

              {creditBanks.length > 0 ? (
                <select
                  value={creditCardBank}
                  onChange={(e) => setCreditCardBank(e.target.value)}
                  required
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-700 ${
                    attemptedSubmit && !creditCardBank.trim()
                      ? "border-red-500/40"
                      : "border-slate-600"
                  }`}
                >
                  <option value="">— Elegí un banco —</option>
                  {creditCardBank.trim() &&
                    !creditBanks.some((b) => b.name === creditCardBank.trim()) && (
                      <option value={creditCardBank.trim()}>
                        {creditCardBank.trim()} (guardado)
                      </option>
                    )}
                  {creditBanks.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              ) : (
                /* Sin bancos configurados */
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3">
                  <p className="text-xs font-semibold text-amber-200">
                    No tenés bancos configurados
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                    Agregá tu banco para poder registrar gastos con tarjeta de crédito.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAddBankModalOpen(true)}
                    className="mt-2 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar banco ahora
                  </button>
                </div>
              )}
            </div>

            {/* Cuotas */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">
                Cuotas
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={creditInstallments}
                onChange={(e) => setCreditInstallments(e.target.value)}
                className="w-full max-w-[8rem] rounded-xl border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-[10px] text-slate-500">
                El total se reparte en la moneda base: cada mes cuenta una cuota desde el mes del gasto.
              </p>
            </div>
          </div>
        )}

        {/* El modal de agregar banco se monta en document.body via portal
            para evitar el problema de forms anidados (HTML no los soporta). */}
        {addBankModalOpen && typeof window !== "undefined" &&
          createPortal(
            <AddCreditCardBankModal
              onClose={() => setAddBankModalOpen(false)}
              onSuccess={(newBank: CreditCardBankEntry) => {
                setAddBankModalOpen(false);
                setCreditCardBank(newBank.name);
              }}
            />,
            document.body
          )
        }
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <div
        className={
          plain
            ? "sticky bottom-0 -mx-4 mt-4 border-t border-slate-800/80 bg-[#1e293b] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
            : "mt-4"
        }
      >
        <button
          type="submit"
          disabled={
            loading ||
            !description.trim() ||
            !amount ||
            (paymentMethod === "Tarjeta de crédito" && !creditCardBank.trim())
          }
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 px-4 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-600"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              {isEdit ? "Guardando…" : "Registrando…"}
            </>
          ) : isEdit ? (
            <>
              <Save className="h-4 w-4" />
              Guardar cambios
            </>
          ) : (
            <>
              <PlusCircle className="h-4 w-4" />
              Agregar gasto
            </>
          )}
        </button>
      </div>
    </form>
  );
}
