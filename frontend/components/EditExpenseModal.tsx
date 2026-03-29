"use client";

import { useEffect, useState } from "react";
import { X, Save, DollarSign } from "lucide-react";
import { updateExpense } from "@/lib/api";
import type { Expense, ExpenseCategory, ExpenseUpdate } from "@/lib/types";

const CATEGORIES: ExpenseCategory[] = [
  "Supermercado", "Transporte", "Suscripciones", "Ocio", "Salud", "Otro",
];

const CURRENCIES = [
  { code: "ARS", flag: "🇦🇷" },
  { code: "USD", flag: "🇺🇸" },
  { code: "EUR", flag: "🇪🇺" },
];

const CATEGORY_COLORS: Record<string, string> = {
  Supermercado: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Transporte:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Suscripciones:"bg-purple-500/15 text-purple-400 border-purple-500/30",
  Ocio:         "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Salud:        "bg-red-500/15 text-red-400 border-red-500/30",
  Otro:         "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

interface Props {
  expense: Expense;
  onClose: () => void;
  onUpdated: (updated: Expense) => void;
}

export default function EditExpenseModal({ expense, onClose, onUpdated }: Props) {
  const [description, setDescription] = useState(expense.description);
  const [amount, setAmount]           = useState(String(expense.original_amount));
  const [currency, setCurrency]       = useState(expense.original_currency);
  const [category, setCategory]       = useState<ExpenseCategory>(expense.category);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const patch: ExpenseUpdate = {};
    if (description.trim() !== expense.description)       patch.description       = description.trim();
    if (parseFloat(amount) !== expense.original_amount)   patch.original_amount   = parseFloat(amount);
    if (currency !== expense.original_currency)           patch.original_currency = currency;
    if (category !== expense.category)                    patch.category          = category;

    if (Object.keys(patch).length === 0) { onClose(); return; }

    setLoading(true);
    try {
      const updated = await updateExpense(expense.id, patch);
      onUpdated(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel — bottom sheet on mobile, centered modal on desktop */}
      <div className="relative w-full sm:max-w-lg bg-[#1e293b] rounded-t-3xl sm:rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden">
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-600" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="font-semibold text-white">Editar gasto</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Descripción
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          {/* Amount + Currency */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Monto
            </label>
            <div className="flex gap-2">
              <div className="flex rounded-xl border border-slate-600 bg-slate-700/60 overflow-hidden shrink-0">
                {CURRENCIES.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setCurrency(c.code)}
                    className={`px-3 py-2 text-sm font-medium transition-all flex items-center gap-1 ${
                      currency === c.code
                        ? "bg-blue-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <span>{c.flag}</span>
                    <span className="hidden sm:inline">{c.code}</span>
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="0.01"
                required
                className="flex-1 bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">
              Categoría
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    category === cat
                      ? CATEGORY_COLORS[cat]
                      : "bg-slate-700/40 text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 text-sm font-medium transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {loading ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
