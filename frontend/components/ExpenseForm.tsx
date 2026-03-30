"use client";

import { useEffect, useState } from "react";
import { PlusCircle, Save } from "lucide-react";
import { createExpense, previewExpenseInBase, updateExpense } from "@/lib/api";
import { useUser } from "@/lib/UserContext";
import type {
  Expense,
  ExpenseBasePreview,
  ExpenseCategory,
  ExpenseUpdate,
  PaymentMethod,
} from "@/lib/types";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "ARS" ? "ARS" : currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

const CATEGORIES: ExpenseCategory[] = [
  "Supermercado",
  "Transporte",
  "Suscripciones",
  "Ocio",
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

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ARS");
  const [category, setCategory] = useState<ExpenseCategory>("Otro");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Otro");
  const [creditCardBank, setCreditCardBank] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [basePreview, setBasePreview] = useState<ExpenseBasePreview | null>(null);
  const [basePreviewLoading, setBasePreviewLoading] = useState(false);

  const baseCurrency = (user?.base_currency ?? "ARS").toUpperCase();
  const creditBanks = user?.credit_card_banks ?? [];

  useEffect(() => {
    if (expenseToEdit) {
      setDescription(expenseToEdit.description);
      setAmount(String(expenseToEdit.original_amount));
      setCurrency(expenseToEdit.original_currency);
      setCategory(expenseToEdit.category);
      setPaymentMethod(expenseToEdit.payment_method ?? "Otro");
      setCreditCardBank(expenseToEdit.credit_card_bank ?? "");
    } else {
      setDescription("");
      setAmount("");
      setCurrency("ARS");
      setCategory("Otro");
      setPaymentMethod("Otro");
      setCreditCardBank("");
    }
    setError("");
  }, [expenseToEdit]);

  useEffect(() => {
    if (paymentMethod !== "Tarjeta de crédito") {
      setCreditCardBank("");
    }
  }, [paymentMethod]);

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
    if (!description.trim() || !amount) return;

    setError("");
    setLoading(true);
    try {
      if (isEdit && expenseToEdit) {
        const patch: ExpenseUpdate = {};
        if (description.trim() !== expenseToEdit.description) patch.description = description.trim();
        if (parseFloat(amount) !== expenseToEdit.original_amount) patch.original_amount = parseFloat(amount);
        if (currency !== expenseToEdit.original_currency) patch.original_currency = currency;
        if (category !== expenseToEdit.category) patch.category = category;
        if (paymentMethod !== (expenseToEdit.payment_method ?? "Otro"))
          patch.payment_method = paymentMethod;

        if (paymentMethod === "Tarjeta de crédito") {
          const trimmed = creditCardBank.trim();
          const prev = (expenseToEdit.credit_card_bank ?? "").trim();
          if (trimmed !== prev) patch.credit_card_bank = trimmed || null;
        }

        if (Object.keys(patch).length === 0) {
          onIdleClose?.();
          setLoading(false);
          return;
        }

        const updated = await updateExpense(expenseToEdit.id, patch);
        onSuccess(updated);
      } else {
        const expense = await createExpense({
          description: description.trim(),
          category,
          original_amount: parseFloat(amount),
          original_currency: currency,
          payment_method: paymentMethod,
          ...(paymentMethod === "Tarjeta de crédito"
            ? { credit_card_bank: creditCardBank.trim() || null }
            : {}),
        });
        onSuccess(expense);
        setDescription("");
        setAmount("");
        setCategory("Otro");
        setPaymentMethod("Otro");
        setCreditCardBank("");
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
            placeholder="Ej: Supermercado Carrefour"
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
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            className="w-full rounded-xl border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full">
          <label className="mb-1.5 block text-xs font-medium text-slate-400">
            Medio de pago
          </label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
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
          <div className="w-full">
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Banco de la tarjeta
            </label>
            {creditBanks.length > 0 ? (
              <select
                value={creditCardBank}
                onChange={(e) => setCreditCardBank(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Elegí un banco</option>
                {creditBanks.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  type="text"
                  value={creditCardBank}
                  onChange={(e) => setCreditCardBank(e.target.value)}
                  placeholder="Opcional — o cargá bancos en Configuraciones"
                  className="w-full rounded-xl border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1.5 text-[11px] font-medium text-amber-400/90">
                  Podés definir tus bancos en Configuraciones para elegir de una lista.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={
          loading ||
          !description.trim() ||
          !amount ||
          (paymentMethod === "Tarjeta de crédito" &&
            creditBanks.length > 0 &&
            !creditCardBank.trim())
        }
        className={`flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 px-4 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-600 ${plain ? "mt-2" : "mt-4"}`}
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
    </form>
  );
}
