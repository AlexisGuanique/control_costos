"use client";

import { useState } from "react";
import { X, CreditCard } from "lucide-react";
import { updateMe } from "@/lib/api";
import { useUser } from "@/lib/UserContext";
import { normalizeCreditCardBanks, type CreditCardBankEntry } from "@/lib/types";
import NthBusinessDaySelect from "@/components/NthBusinessDaySelect";

interface Props {
  onClose: () => void;
  /** Llamado con la entrada recién creada una vez que se guardó exitosamente. */
  onSuccess: (newBank: CreditCardBankEntry) => void;
  /** z-index personalizado (por defecto z-[300] para estar sobre modales de gastos). */
  zIndex?: string;
}

export default function AddCreditCardBankModal({
  onClose,
  onSuccess,
  zIndex = "z-[300]",
}: Props) {
  const { user, setUser } = useUser();
  const creditBanks = normalizeCreditCardBanks(user?.credit_card_banks ?? []);

  const [bankName, setBankName] = useState("");
  const [dueMode, setDueMode] = useState<"calendar" | "business">("business");
  const [calendarDay, setCalendarDay] = useState("");
  const [businessNth, setBusinessNth] = useState("10");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const name = bankName.trim();
    if (!name) {
      setError("El nombre del banco es obligatorio.");
      return;
    }
    if (creditBanks.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
      setError("Ese banco ya está en tu lista.");
      return;
    }

    let due_day: number | null = null;
    let business_nth: number | null = null;

    if (dueMode === "calendar") {
      const raw = calendarDay.trim();
      if (raw) {
        const d = parseInt(raw, 10);
        if (Number.isNaN(d) || d < 1 || d > 31) {
          setError("El día del mes debe ser entre 1 y 31.");
          return;
        }
        due_day = d;
      }
    } else {
      const n = parseInt(businessNth, 10);
      if (Number.isNaN(n) || n < 1 || n > 23) {
        setError("Elegí un día hábil entre 1 y 23.");
        return;
      }
      business_nth = n;
    }

    const newEntry: CreditCardBankEntry = {
      name,
      due_mode: dueMode,
      due_day,
      business_nth,
      cut_mode: "none",
      cut_day: null,
      cut_weekday: null,
      cut_weekday_nth: null,
    };

    setSaving(true);
    try {
      const updated = await updateMe({
        credit_card_banks: [...creditBanks, newEntry],
      });
      setUser(updated);
      onSuccess(newEntry);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el banco.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`fixed inset-0 ${zIndex} flex items-center justify-center p-3 sm:p-4`}>
      {/* Overlay */}
      <div
        className="absolute inset-0 min-h-[100dvh] w-full bg-black/70 backdrop-blur-sm"
        onClick={saving ? undefined : onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-bank-modal-title"
        className="relative flex max-h-[min(90dvh,100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-600/80 bg-[#1e293b] shadow-2xl shadow-black/50"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-700/50 bg-slate-800/40 px-5 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15">
            <CreditCard className="h-4 w-4 text-blue-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="add-bank-modal-title" className="truncate text-base font-semibold text-white">
              Agregar banco
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Configurá el vencimiento del resumen para este banco.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Nombre */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor="new-bank-name">
                Nombre del banco
              </label>
              <input
                id="new-bank-name"
                type="text"
                autoFocus
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Ej: Galicia, Santander…"
                className="h-11 w-full rounded-xl border border-slate-600 bg-slate-700/60 px-4 text-sm text-white placeholder-slate-500 transition focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>

            {/* Tipo de vencimiento + valor */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor="new-bank-due-mode">
                  Tipo de vencimiento del resumen
                </label>
                <select
                  id="new-bank-due-mode"
                  value={dueMode}
                  onChange={(e) => setDueMode(e.target.value as "calendar" | "business")}
                  className="h-11 w-full rounded-xl border border-slate-600 bg-slate-700/60 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="business">N-ésimo día hábil (lun–vie)</option>
                  <option value="calendar">Día fijo del calendario (1–31)</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor="new-bank-due-value">
                  {dueMode === "business" ? "Qué día hábil" : "Día del mes"}
                </label>
                {dueMode === "business" ? (
                  <NthBusinessDaySelect
                    id="new-bank-due-value"
                    value={businessNth}
                    onChange={setBusinessNth}
                  />
                ) : (
                  <input
                    id="new-bank-due-value"
                    type="number"
                    min={1}
                    max={31}
                    inputMode="numeric"
                    value={calendarDay}
                    onChange={(e) => setCalendarDay(e.target.value)}
                    placeholder="Opcional"
                    className="h-11 w-full rounded-xl border border-slate-600 bg-slate-700/60 px-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                )}
              </div>
            </div>

            {error && (
              <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-700/50 bg-slate-900/30 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-700/80 hover:text-white disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !bankName.trim()}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Agregar banco"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
