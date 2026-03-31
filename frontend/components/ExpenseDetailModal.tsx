"use client";

import { useEffect } from "react";
import { Bot, Pencil, X } from "lucide-react";
import type { Expense } from "@/lib/types";
import { paymentMethodFullLabel } from "@/lib/expenseDisplay";

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "ARS" ? "ARS" : currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  expense: Expense;
  baseCurrency: string;
  onClose: () => void;
  onEdit: (expense: Expense) => void;
}

export default function ExpenseDetailModal({ expense, baseCurrency, onClose, onEdit }: Props) {
  const isConverted = expense.original_currency !== baseCurrency;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[102] flex min-h-[100dvh] items-end justify-center sm:items-center sm:p-4">
      <div
        className="fixed inset-0 min-h-[100dvh] w-full bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-detail-title"
        className="relative z-10 flex max-h-[min(90dvh,calc(100dvh-1rem))] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-slate-800/90 bg-[#1e293b] shadow-2xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-3 sm:px-5">
          <h2 id="expense-detail-title" className="min-w-0 truncate text-base font-semibold text-white">
            Detalle del gasto
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-slate-500">Descripción</dt>
              <dd className="mt-1 text-slate-100">{expense.description}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Categoría</dt>
              <dd className="mt-1 text-slate-200">{expense.category}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Medio de pago</dt>
              <dd className="mt-1 break-words text-slate-200">{paymentMethodFullLabel(expense)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Monto original</dt>
              <dd className="mt-1 tabular-nums text-slate-100">
                {formatCurrency(expense.original_amount, expense.original_currency)}{" "}
                <span className="text-slate-500">{expense.original_currency}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">En {baseCurrency}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-white">
                {formatCurrency(expense.base_amount, baseCurrency)}
              </dd>
              {isConverted && (
                <p className="mt-1 text-xs text-slate-500">
                  Cotización usada: {expense.exchange_rate_used.toLocaleString("es-AR")}
                </p>
              )}
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Origen</dt>
              <dd className="mt-1">
                {expense.source === "WebChat" ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-xs text-purple-300">
                    <Bot className="h-3.5 w-3.5" /> IA
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-700/50 px-2 py-1 text-xs text-slate-300">
                    <Pencil className="h-3.5 w-3.5" /> Manual
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Fecha y hora</dt>
              <dd className="mt-1 text-slate-300">{formatDateTime(expense.created_at)}</dd>
            </div>
          </dl>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-800/80 bg-slate-900/40 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => {
              onEdit(expense);
              onClose();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            <Pencil className="h-4 w-4" />
            Editar
          </button>
        </div>
      </div>
    </div>
  );
}
