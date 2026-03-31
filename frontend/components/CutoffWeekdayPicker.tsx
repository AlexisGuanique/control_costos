"use client";

import { useMemo } from "react";

type Weekday = 0 | 1 | 2 | 3 | 4;

const WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: 0, label: "Lunes" },
  { value: 1, label: "Martes" },
  { value: 2, label: "Miércoles" },
  { value: 3, label: "Jueves" },
  { value: 4, label: "Viernes" },
];

const NTHS = [1, 2, 3, 4] as const;

export default function CutoffWeekdayPicker(props: {
  weekday: string;
  nth: string;
  onWeekdayChange: (v: string) => void;
  onNthChange: (v: string) => void;
  ids?: { weekday?: string; nth?: string };
  disabled?: boolean;
}) {
  const { weekday, nth, onWeekdayChange, onNthChange, ids, disabled } = props;

  const nthLabel = useMemo(() => {
    const n = parseInt(nth, 10);
    if (!Number.isFinite(n)) return "Elegí…";
    return `${n}º`;
  }, [nth]);

  return (
    <div className="grid grid-cols-2 gap-2">
      <select
        id={ids?.nth}
        disabled={disabled}
        value={nth}
        onChange={(e) => onNthChange(e.target.value)}
        className="h-11 w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50"
        aria-label="Número de semana hábil (1º a 4º)"
      >
        <option value="">{nthLabel}</option>
        {NTHS.map((n) => (
          <option key={n} value={String(n)}>
            {n}º
          </option>
        ))}
      </select>

      <select
        id={ids?.weekday}
        disabled={disabled}
        value={weekday}
        onChange={(e) => onWeekdayChange(e.target.value)}
        className="h-11 w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50"
        aria-label="Día de semana hábil"
      >
        <option value="">Elegí día…</option>
        {WEEKDAYS.map((w) => (
          <option key={w.value} value={String(w.value)}>
            {w.label}
          </option>
        ))}
      </select>
    </div>
  );
}

