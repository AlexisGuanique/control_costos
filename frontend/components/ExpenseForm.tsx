"use client";

import { useState } from "react";
import { PlusCircle } from "lucide-react";
import { createExpense } from "@/lib/api";
import type { Expense, ExpenseCategory } from "@/lib/types";

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

interface Props {
  onCreated: (expense: Expense) => void;
}

export default function ExpenseForm({ onCreated }: Props) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ARS");
  const [category, setCategory] = useState<ExpenseCategory>("Otro");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !amount) return;

    setError("");
    setLoading(true);
    try {
      const expense = await createExpense({
        description: description.trim(),
        category,
        original_amount: parseFloat(amount),
        original_currency: currency,
      });
      onCreated(expense);
      setDescription("");
      setAmount("");
      setCategory("Otro");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al registrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-800/60 rounded-2xl border border-slate-700 p-5"
    >
      <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
        <PlusCircle className="w-5 h-5 text-blue-400" />
        Registrar gasto manual
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Descripción
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej: Supermercado Carrefour"
            required
            className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Monto
          </label>
          <div className="flex gap-2">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="bg-slate-700 border border-slate-600 rounded-xl px-2 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
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
              className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Categoría
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !description.trim() || !amount}
        className="mt-4 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Registrando...
          </>
        ) : (
          <>
            <PlusCircle className="w-4 h-4" />
            Agregar gasto
          </>
        )}
      </button>
    </form>
  );
}
