"use client";

import { useState, type ComponentType } from "react";
import {
  Trash2,
  ArrowUpDown,
  Bot,
  Pencil,
  Receipt,
  Utensils,
  Plane,
  PartyPopper,
  Car,
  Sparkles,
  Bike,
  GraduationCap,
  Users,
  Home,
  ShoppingBag,
  ShoppingCart,
  PawPrint,
  Gift,
  Repeat,
  HeartPulse,
  Package,
  Gamepad2,
  Bus,
} from "lucide-react";
import type { Expense } from "@/lib/types";
import { paymentMethodFullLabel } from "@/lib/expenseDisplay";
import { deleteExpense } from "@/lib/api";
import ConfirmDialog from "@/components/ConfirmDialog";

const CATEGORY_COLORS: Record<string, string> = {
  Comidas: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  Supermercado: "bg-green-500/10 text-green-300 border-green-500/20",
  Delivery: "bg-lime-500/10 text-lime-300 border-lime-500/20",
  Salidas: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20",
  Viajes: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  Auto: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  Hogar: "bg-teal-500/10 text-teal-300 border-teal-500/20",
  Familia: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  Educación: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
  Deporte: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  Belleza: "bg-pink-500/10 text-pink-300 border-pink-500/20",
  Ocio: "bg-yellow-500/10 text-yellow-300 border-yellow-500/20",
  Ropa: "bg-violet-500/10 text-violet-300 border-violet-500/20",
  Mascotas: "bg-orange-500/10 text-orange-300 border-orange-500/20",
  Regalos: "bg-red-500/10 text-red-300 border-red-500/20",
  Suscripciones: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Salud: "bg-red-500/10 text-red-400 border-red-500/20",
  Transporte: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  Otro: "bg-slate-500/10 text-slate-300 border-slate-500/20",
};

const CATEGORY_ICON: Record<string, ComponentType<{ className?: string }>> = {
  Comidas: Utensils,
  Supermercado: ShoppingCart,
  Delivery: Package,
  Salidas: PartyPopper,
  Viajes: Plane,
  Auto: Car,
  Hogar: Home,
  Familia: Users,
  "Educación": GraduationCap,
  Deporte: Bike,
  Belleza: Sparkles,
  Ocio: Gamepad2,
  Ropa: ShoppingBag,
  Mascotas: PawPrint,
  Regalos: Gift,
  Suscripciones: Repeat,
  Salud: HeartPulse,
  Transporte: Bus,
  Otro: Receipt,
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
  /** Al hacer clic en la fila (no en acciones). */
  onRowClick?: (expense: Expense) => void;
}

export default function ExpenseTable({ expenses, baseCurrency, onDeleted, onEdit, onRowClick }: Props) {
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
      <div className="text-center py-16 text-slate-400">
        <p className="text-lg">No hay gastos registrados todavía.</p>
        <p className="text-sm mt-1">Agregá tu primer gasto arriba.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-800/60 text-slate-300 uppercase text-xs tracking-wider">
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
            const payFull = paymentMethodFullLabel(expense);
            return (
              <tr
                key={expense.id}
                onClick={() => onRowClick?.(expense)}
                onKeyDown={(e) => {
                  // Solo activar con teclado si la fila misma tiene foco (no al interactuar con modales/botones).
                  if (e.currentTarget !== e.target) return;
                  if (onRowClick && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onRowClick(expense);
                  }
                }}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
                className={`hover:bg-slate-800/40 transition-colors group ${onRowClick ? "cursor-pointer" : ""}`}
              >
                <td className="px-4 py-3 font-medium text-slate-100 max-w-[200px] truncate">
                  {expense.description}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${CATEGORY_COLORS[expense.category] ?? CATEGORY_COLORS.Otro}`}
                  >
                    {(() => {
                      const Icon = CATEGORY_ICON[expense.category] ?? Receipt;
                      return <Icon className="w-3.5 h-3.5 mr-1.5" />;
                    })()}
                    {expense.category}
                  </span>
                </td>
                <td className="hidden max-w-[11rem] px-4 py-3 sm:table-cell">
                  <span
                    className="block truncate text-xs text-slate-300"
                    title={payFull}
                  >
                    {payFull}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                  {formatCurrency(expense.original_amount, expense.original_currency)}{" "}
                  <span className="text-slate-400 text-xs">
                    {expense.original_currency}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-white">
                  {formatCurrency(expense.base_amount, baseCurrency)}
                  {isConverted && (
                    <span className="block text-xs text-slate-400 font-normal">
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
                    <span className="inline-flex items-center gap-1 text-xs text-slate-300 bg-slate-500/10 px-2 py-1 rounded-full border border-slate-500/20">
                      <Pencil className="w-3 h-3" /> Manual
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                  {formatDate(expense.created_at)}
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(expense);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 transition"
                        title="Editar gasto"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(expense);
                      }}
                      disabled={deletingId === expense.id}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-300 hover:bg-red-500/10 disabled:cursor-wait transition"
                      title="Eliminar gasto"
                    >
                      {deletingId === expense.id ? (
                        <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-red-300 rounded-full animate-spin block" />
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
