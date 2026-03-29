"use client";

import { useMemo, useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

const WEEK_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseISODate(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Primer día del mes como índice 0=Lun ... 6=Dom */
function mondayIndex(year: number, month: number) {
  const first = new Date(year, month, 1).getDay();
  return first === 0 ? 6 : first - 1;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

interface MiniCalendarProps {
  value: string;
  onChange: (iso: string) => void;
  minDate?: string;
  maxDate?: string;
}

export function MiniCalendar({ value, onChange, minDate, maxDate }: MiniCalendarProps) {
  const selected = parseISODate(value);
  const [view, setView] = useState(() => {
    const base = selected ?? new Date();
    return { y: base.getFullYear(), m: base.getMonth() };
  });

  const minD = minDate ? parseISODate(minDate) : null;
  const maxD = maxDate ? parseISODate(maxDate) : null;

  const { cells, year, month } = useMemo(() => {
    const y = view.y;
    const m = view.m;
    const dim = daysInMonth(y, m);
    const lead = mondayIndex(y, m);
    const cells: ({ day: number } | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push({ day: d });
    while (cells.length % 7 !== 0) cells.push(null);
    while (cells.length < 42) cells.push(null);
    return { cells, year: y, month: m };
  }, [view]);

  function isDisabled(day: number) {
    const d = new Date(year, month, day);
    if (minD && d < new Date(minD.getFullYear(), minD.getMonth(), minD.getDate())) return true;
    if (maxD && d > new Date(maxD.getFullYear(), maxD.getMonth(), maxD.getDate())) return true;
    return false;
  }

  function isSelected(day: number) {
    if (!selected) return false;
    return (
      selected.getFullYear() === year &&
      selected.getMonth() === month &&
      selected.getDate() === day
    );
  }

  function isToday(day: number) {
    const t = new Date();
    return t.getFullYear() === year && t.getMonth() === month && t.getDate() === day;
  }

  function prevMonth() {
    setView((v) => {
      let { y, m } = v;
      m -= 1;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
      return { y, m };
    });
  }

  function nextMonth() {
    setView((v) => {
      let { y, m } = v;
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
      return { y, m };
    });
  }

  return (
    <div className="rounded-xl border border-slate-600/80 bg-slate-800/90 p-3 shadow-xl">
      <div className="flex items-center justify-between mb-3 px-1">
        <button
          type="button"
          onClick={prevMonth}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/80 transition"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-semibold text-white capitalize">
          {MONTHS_ES[month]} {year}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/80 transition"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEK_DAYS.map((w) => (
          <div key={w} className="text-center text-[10px] font-medium text-slate-500 py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, i) => {
          if (!cell) {
            return <div key={`e-${i}`} className="aspect-square" />;
          }
          const { day } = cell;
          const disabled = isDisabled(day);
          const sel = isSelected(day);
          const today = isToday(day);
          return (
            <button
              key={`${year}-${month}-${day}`}
              type="button"
              disabled={disabled}
              onClick={() => onChange(toISODate(new Date(year, month, day)))}
              className={`
                aspect-square max-h-9 text-sm rounded-lg transition font-medium
                ${disabled ? "text-slate-600 cursor-not-allowed" : "text-slate-200 hover:bg-slate-600/70"}
                ${sel ? "bg-blue-600 text-white hover:bg-blue-500 shadow-md shadow-blue-500/20" : ""}
                ${today && !sel ? "ring-1 ring-blue-500/50 text-blue-300" : ""}
              `}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface DatePickerFieldProps {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  minDate?: string;
  maxDate?: string;
  placeholder?: string;
}

export function DatePickerField({
  label,
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = "Elegir fecha",
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 300 });

  useEffect(() => {
    setMounted(true);
  }, []);

  const placePanel = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const maxW = Math.min(340, Math.max(260, window.innerWidth - 2 * margin));
    const ph = Math.max(panel.offsetHeight, 260);
    const pw = Math.min(maxW, rect.width > 200 ? rect.width : maxW);
    const gap = 8;

    let top = rect.bottom + gap;
    if (top + ph > window.innerHeight - margin) {
      top = rect.top - ph - gap;
    }
    if (top < margin) {
      top = margin;
    }
    if (top + ph > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - margin - ph);
    }

    let left = rect.left;
    if (left + pw > window.innerWidth - margin) {
      left = window.innerWidth - pw - margin;
    }
    if (left < margin) {
      left = margin;
    }

    setPanelPos({ top, left, width: pw });
  }, []);

  useLayoutEffect(() => {
    if (!open || !mounted) return;
    placePanel();
    const t = requestAnimationFrame(() => placePanel());
    return () => cancelAnimationFrame(t);
  }, [open, mounted, placePanel]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => placePanel();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, placePanel]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const display = useMemo(() => {
    if (!value) return null;
    const d = parseISODate(value);
    if (!d) return value;
    return d.toLocaleDateString("es-AR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }, [value]);

  const panel =
    mounted &&
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={panelRef}
        className="fixed z-[9999] max-h-[min(85vh,420px)] overflow-y-auto overflow-x-hidden rounded-xl shadow-2xl ring-1 ring-slate-600/50"
        style={{
          top: panelPos.top,
          left: panelPos.left,
          width: panelPos.width,
        }}
        role="dialog"
        aria-label="Elegir fecha"
      >
        <MiniCalendar
          value={value}
          onChange={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
          minDate={minDate}
          maxDate={maxDate}
        />
      </div>,
      document.body
    );

  return (
    <div className="relative">
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`
          w-full flex items-center justify-between gap-2 bg-slate-700/60 border rounded-xl px-3 py-2.5 text-left text-sm transition
          ${open ? "border-blue-500 ring-2 ring-blue-500/30" : "border-slate-600 hover:border-slate-500"}
        `}
      >
        <span className={display ? "text-white" : "text-slate-500"}>
          {display ?? placeholder}
        </span>
        <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
      </button>
      {panel}
    </div>
  );
}
