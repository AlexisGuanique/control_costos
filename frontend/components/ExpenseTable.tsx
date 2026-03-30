"use client";

import { useState } from "react";
import { Trash2, ArrowUpDown, Bot, Pencil } from "lucide-react";
import type { Expense } from "@/lib/types";
import { deleteExpense } from "@/lib/api";
import ConfirmDialog from "@/components/ConfirmDialog";

const CATEGORY_COLORS: Record<string, string> = {
  Supermercado: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Transporte: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Suscripciones: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Ocio: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Salud: "bg-red-500/10 text-red-400 border-red-500/20",
  Otro: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "ARS" ? "ARS" : currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface Props {
  expenses: Expense[];
  baseCurrency: string;
  onDeleted: (id: number) => void;
  onEdit?: (expense: Expense) => void;
}

export default function ExpenseTable({ expenses, baseCurrency, onDeleted, onEdit }: Props) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...expenses].sort((a, b) => {
    const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return sortAsc ? diff : -diff;
  });

  async function executeDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeletingId(id);
    try {
      await deleteExpense(id);
      setDeleteTarget(null);
      onDeleted(id);
    } catch {
      /* ignore */
    } finally {
      setDeletingId(null);
    }
  }

  if (expenses.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="text-lg">No hay gastos registrados todavía.</p>
        <p className="text-sm mt-1">Agregá tu primer gasto arriba.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-800/60 text-slate-400 uppercase text-xs tracking-wider">
            <th className="text-left px-4 py-3">Descripción</th>
            <th className="text-left px-4 py-3">Categoría</th>
            <th className="text-left px-4 py-3 hidden sm:table-cell">Pago</th>
            <th className="text-right px-4 py-3">Original</th>
            <th className="text-right px-4 py-3">
              {baseCurrency}
            </th>
            <th className="text-center px-4 py-3">Origen</th>
            <th className="text-left px-4 py-3">
              <button
                type="button"
                onClick={() => setSortAsc(!sortAsc)}
                className="flex items-center gap-1 hover:text-white transition"
              >
                Fecha <ArrowUpDown className="w-3 h-3" />
              </button>
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {sorted.map((expense) => {
            const isConverted = expense.original_currency !== baseCurrency;
            return (
              <tr
                key={expense.id}
                className="hover:bg-slate-800/40 transition-colors group"
              >
                <td className="px-4 py-3 font-medium text-slate-100 max-w-[200px] truncate">
                  {expense.description}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${CATEGORY_COLORS[expense.category] ?? CATEGORY_COLORS.Otro}`}
                  >
                    {expense.category}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-300 text-xs max-w-[9rem] truncate hidden sm:table-cell">
                  {expense.payment_method ?? "Otro"}
                  {expense.payment_method === "Tarjeta de crédito" && expense.credit_card_bank
                    ? ` · ${expense.credit_card_bank}`
                    : ""}
                  {expense.payment_method === "Tarjeta de crédito" &&
                  (expense.credit_installments ?? 1) > 1
                    ? ` · ${expense.credit_installments ?? 1} cuotas`
                    : ""}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                  {formatCurrency(expense.original_amount, expense.original_currency)}{" "}
                  <span className="text-slate-500 text-xs">
                    {expense.original_currency}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-white">
                  {formatCurrency(expense.base_amount, baseCurrency)}
                  {isConverted && (
                    <span className="block text-xs text-slate-500 font-normal">
                      @ {expense.exchange_rate_used.toLocaleString("es-AR")}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {expense.source === "WebChat" ? (
                    <span title="Registrado via IA" className="inline-flex items-center gap-1 text-xs text-purple-400 bg-purple-500/10 px-2 py-1 rounded-full border border-purple-500/20">
                      <Bot className="w-3 h-3" /> IA
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-500/10 px-2 py-1 rounded-full border border-slate-500/20">
                      <Pencil className="w-3 h-3" /> Manual
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                  {formatDate(expense.created_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(expense)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition"
                        title="Editar gasto"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(expense)}
                      disabled={deletingId === expense.id}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 disabled:cursor-wait transition"
                      title="Eliminar gasto"
                    >
                      {deletingId === expense.id ? (
                        <span className="w-3.5 h-3.5 border-2 border-slate-500 border-t-red-400 rounded-full animate-spin block" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar gasto"
        message={
          deleteTarget
            ? `¿Eliminar “${deleteTarget.description}” por ${formatCurrency(deleteTarget.base_amount, baseCurrency)}? Esta acción no se puede deshacer.`
            : ""
        }
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleteTarget !== null && deletingId === deleteTarget.id}
        onConfirm={executeDelete}
        onCancel={() =>
          !(deleteTarget && deletingId === deleteTarget.id) && setDeleteTarget(null)
        }
      />
    </div>
  );
}
