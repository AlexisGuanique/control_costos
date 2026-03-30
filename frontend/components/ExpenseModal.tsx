"use client";

import { useEffect } from "react";
import { Pencil, PlusCircle, X } from "lucide-react";
import ExpenseForm from "@/components/ExpenseForm";
import type { Expense } from "@/lib/types";

interface Props {
  onClose: () => void;
  /** Si viene un gasto, el modal abre en modo edición. */
  expenseToEdit?: Expense | null;
  onSaved: (expense: Expense) => void;
}

export default function ExpenseModal({ onClose, expenseToEdit = null, onSaved }: Props) {
  const isEdit = expenseToEdit != null;

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
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative z-10 flex max-h-[min(640px,calc(100dvh-env(safe-area-inset-bottom,0px)-1rem))] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-800/90 bg-[#1e293b] shadow-2xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-modal-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
              {isEdit ? (
                <Pencil className="h-4 w-4 text-blue-400" />
              ) : (
                <PlusCircle className="h-4 w-4 text-blue-400" />
              )}
            </div>
            <h2 id="expense-modal-title" className="truncate text-base font-semibold text-white">
              {isEdit ? "Editar gasto" : "Nuevo gasto"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <ExpenseForm
            key={expenseToEdit?.id ?? "new"}
            plain
            expenseToEdit={expenseToEdit}
            onSuccess={(expense) => {
              onSaved(expense);
              onClose();
            }}
            onIdleClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}
