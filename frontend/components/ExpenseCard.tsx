"use client";

import { useState, type ComponentType } from "react";
import {
  Trash2,
  Pencil,
  Bot,
  ArrowRight,
  Calendar,
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
  PawPrint,
  Gift,
  Repeat,
  HeartPulse,
  Package,
} from "lucide-react";
import { deleteExpense } from "@/lib/api";
import type { Expense } from "@/lib/types";
import ConfirmDialog from "@/components/ConfirmDialog";

const CATEGORY_COLORS: Record<string, { badge: string; dot: string }> = {
  Comidas:       { badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",  dot: "bg-emerald-400" },
  Delivery:      { badge: "bg-lime-500/10 text-lime-300 border-lime-500/20",           dot: "bg-lime-400" },
  Salidas:       { badge: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20",  dot: "bg-fuchsia-400" },
  Viajes:        { badge: "bg-sky-500/10 text-sky-300 border-sky-500/20",              dot: "bg-sky-400" },
  Auto:          { badge: "bg-amber-500/10 text-amber-300 border-amber-500/20",        dot: "bg-amber-400" },
  Hogar:         { badge: "bg-teal-500/10 text-teal-300 border-teal-500/20",           dot: "bg-teal-400" },
  Familia:       { badge: "bg-rose-500/10 text-rose-300 border-rose-500/20",           dot: "bg-rose-400" },
  "Educación":   { badge: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",     dot: "bg-indigo-400" },
  Deporte:       { badge: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",           dot: "bg-cyan-400" },
  Belleza:       { badge: "bg-pink-500/10 text-pink-300 border-pink-500/20",           dot: "bg-pink-400" },
  Ropa:          { badge: "bg-violet-500/10 text-violet-300 border-violet-500/20",     dot: "bg-violet-400" },
  Mascotas:      { badge: "bg-orange-500/10 text-orange-300 border-orange-500/20",     dot: "bg-orange-400" },
  Regalos:       { badge: "bg-red-500/10 text-red-300 border-red-500/20",              dot: "bg-red-400" },
  Suscripciones: { badge: "bg-purple-500/10 text-purple-400 border-purple-500/20",     dot: "bg-purple-400" },
  Salud:         { badge: "bg-red-500/10 text-red-400 border-red-500/20",              dot: "bg-red-400" },
  Otro:          { badge: "bg-slate-500/10 text-slate-400 border-slate-500/20",        dot: "bg-slate-400" },
};

const CATEGORY_ICON: Record<string, ComponentType<{ className?: string }>> = {
  Comidas: Utensils,
  Delivery: Package,
  Salidas: PartyPopper,
  Viajes: Plane,
  Auto: Car,
  Hogar: Home,
  Familia: Users,
  "Educación": GraduationCap,
  Deporte: Bike,
  Belleza: Sparkles,
  Ropa: ShoppingBag,
  Mascotas: PawPrint,
  Regalos: Gift,
  Suscripciones: Repeat,
  Salud: HeartPulse,
  Otro: Receipt,
};

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "ARS" ? "ARS" : currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface Props {
  expense: Expense;
  baseCurrency: string;
  onDeleted: (id: number) => void;
  onEdit: (expense: Expense) => void;
}

export default function ExpenseCard({ expense, baseCurrency, onDeleted, onEdit }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const colors = CATEGORY_COLORS[expense.category] ?? CATEGORY_COLORS.Otro;
  const isConverted = expense.original_currency !== baseCurrency;

  async function executeDelete() {
    setDeleting(true);
    try {
      await deleteExpense(expense.id);
      setConfirmDelete(false);
      onDeleted(expense.id);
    } catch {
      /* sin toast: el usuario puede reintentar */
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={`bg-slate-800/60 rounded-2xl border border-slate-700/60 p-4 space-y-3 transition-opacity ${deleting ? "opacity-50" : ""}`}>
      {/* Top row: description + source */}
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-white leading-snug line-clamp-2 flex-1">
          {expense.description}
        </p>
        {expense.source === "WebChat" ? (
          <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
            <Bot className="w-3 h-3" /> IA
          </span>
        ) : (
          <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-700/50 border border-slate-600/50 px-2 py-0.5 rounded-full">
            <Pencil className="w-3 h-3" /> Manual
          </span>
        )}
      </div>

      {/* Category + payment */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${colors.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
          {(() => {
            const Icon = CATEGORY_ICON[expense.category] ?? Receipt;
            return <Icon className="w-3.5 h-3.5" />;
          })()}
          {expense.category}
        </span>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border border-amber-500/25 bg-amber-500/10 text-amber-200/90">
          {expense.payment_method ?? "Otro"}
          {expense.payment_method === "Tarjeta de crédito" && expense.credit_card_bank
            ? ` · ${expense.credit_card_bank}`
            : ""}
          {expense.payment_method === "Tarjeta de crédito" &&
          (expense.credit_installments ?? 1) > 1
            ? ` · ${expense.credit_installments ?? 1} cuotas`
            : ""}
        </span>
      </div>

      {/* Amount block */}
      <div className="bg-slate-700/30 rounded-xl p-3 border border-slate-700/40">
        {isConverted ? (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-center">
              <p className="text-[10px] text-slate-500 mb-0.5">Original</p>
              <p className="text-sm font-semibold text-slate-300">
                {formatAmount(expense.original_amount, expense.original_currency)}
                <span className="text-slate-500 text-[10px] ml-1">{expense.original_currency}</span>
              </p>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <ArrowRight className="w-4 h-4 text-slate-500" />
              <span className="text-[10px] text-slate-600">
                @{expense.exchange_rate_used.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-slate-500 mb-0.5">{baseCurrency}</p>
              <p className="text-base font-bold text-white">
                {formatAmount(expense.base_amount, baseCurrency)}
              </p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-[10px] text-slate-500 mb-0.5">{baseCurrency}</p>
            <p className="text-xl font-bold text-white">
              {formatAmount(expense.base_amount, baseCurrency)}
            </p>
          </div>
        )}
      </div>

      {/* Footer: date + actions */}
      <div className="flex items-center justify-between pt-0.5">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <Calendar className="w-3.5 h-3.5" />
          {formatDate(expense.created_at)}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(expense)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/20 transition-all"
          >
            <Pencil className="w-3.5 h-3.5" />
            Editar
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all disabled:cursor-wait"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar gasto"
        message={`¿Eliminar “${expense.description}” por ${formatAmount(expense.base_amount, baseCurrency)}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
        onConfirm={executeDelete}
        onCancel={() => !deleting && setConfirmDelete(false)}
      />
    </div>
  );
}
