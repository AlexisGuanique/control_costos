"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

const OPTIONS = Array.from({ length: 23 }, (_, i) => i + 1);

interface Props {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
}

/**
 * Selector del N-ésimo día hábil: modal compacto con scroll (evita el picker nativo a pantalla completa en móvil).
 */
export default function NthBusinessDaySelect({ value, onChange, id, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const n = parseInt(value, 10);
  const label =
    Number.isFinite(n) && n >= 1 && n <= 23 ? `${n}º día hábil` : "Elegí…";

  const modal =
    open &&
    mounted &&
    createPortal(
      <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 sm:p-6">
        <button
          type="button"
          className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
          aria-label="Cerrar"
          onClick={() => setOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={id ? `${id}-title` : undefined}
          className="relative z-10 flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-600 bg-[#1e293b] shadow-2xl shadow-black/50 ring-1 ring-slate-700/40"
        >
          <div className="shrink-0 border-b border-slate-700/80 px-4 py-3">
            <p id={id ? `${id}-title` : undefined} className="text-sm font-semibold text-white">
              Día hábil del mes
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Lun–vie (sin feriados)</p>
          </div>
          <div className="max-h-[min(280px,42vh)] overflow-y-auto overscroll-contain py-1">
            {OPTIONS.map((opt) => {
              const selected = String(opt) === value;
              return (
                <button
                  key={opt}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition ${
                    selected
                      ? "bg-amber-500/15 text-amber-100"
                      : "text-slate-200 hover:bg-slate-700/80"
                  }`}
                  onClick={() => {
                    onChange(String(opt));
                    setOpen(false);
                  }}
                >
                  {selected ? (
                    <Check className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                  ) : (
                    <span className="inline-block w-4 shrink-0" aria-hidden />
                  )}
                  <span>{opt}º día hábil</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <div className="w-full min-w-0">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setOpen(true)}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-slate-600 bg-slate-700/60 px-3 text-left text-sm text-white transition hover:bg-slate-700/90 focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </button>
      {modal}
    </div>
  );
}
