"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS_MON_FIRST = ["L", "M", "X", "J", "V", "S", "D"];

function monthTitle(year: number, month: number) {
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1)
  );
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/** Grilla tipo calendario solo con los días que existen en ese mes. */
function buildCalendarCells(year: number, month: number): (number | null)[] {
  const last = lastDayOfMonth(year, month);
  const jsDow = new Date(year, month - 1, 1).getDay();
  const padBefore = jsDow === 0 ? 6 : jsDow - 1;
  const cells: (number | null)[] = Array(padBefore).fill(null);
  for (let d = 1; d <= last; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export interface DayOfMonthPickerProps {
  value: string;
  onChange: (value: string) => void;
  /** Mes inicial al abrir (se sincroniza al abrir el panel). */
  alignMonth: { year: number; month: number };
  /**
   * Si es true, no se puede pasar de mes en el panel (el mes viene de `alignMonth`, p. ej. selectors externos).
   */
  lockMonth?: boolean;
  triggerClassName?: string;
  disabled?: boolean;
  id?: string;
}

const MIN_Y = 2000;
const MAX_Y = 2100;

export default function DayOfMonthPicker({
  value,
  onChange,
  alignMonth,
  lockMonth = false,
  triggerClassName = "",
  disabled = false,
  id,
}: DayOfMonthPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 0 });

  const [view, setView] = useState({ y: alignMonth.year, m: alignMonth.month });

  const selected = value.trim() === "" ? null : parseInt(value, 10);
  const label =
    selected != null && !Number.isNaN(selected) && selected >= 1 && selected <= 31
      ? `Día ${selected}`
      : "Sin día";

  const updatePosition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = 268;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const h = panelRef.current?.getBoundingClientRect().height ?? 280;
    let top = r.bottom + 6;
    const pad = 8;
    const bottomEdge = top + h;
    if (bottomEdge > window.innerHeight - pad) {
      const above = r.top - h - 6;
      if (above >= pad) {
        top = above;
      } else {
        top = Math.max(pad, window.innerHeight - h - pad);
      }
    }
    setPanelPos({ top, left, width: w });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    setView({ y: alignMonth.year, m: alignMonth.month });
  }, [open, alignMonth.year, alignMonth.month]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const idRaf = requestAnimationFrame(() => updatePosition());
    return () => cancelAnimationFrame(idRaf);
  }, [open, view.y, view.m, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function goPrevMonth() {
    setView((v) => {
      let { y, m } = v;
      m--;
      if (m < 1) {
        m = 12;
        y--;
      }
      if (y < MIN_Y) return v;
      return { y, m };
    });
  }

  function goNextMonth() {
    setView((v) => {
      let { y, m } = v;
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
      if (y > MAX_Y) return v;
      return { y, m };
    });
  }

  const cells = buildCalendarCells(view.y, view.m);
  const lastInView = lastDayOfMonth(view.y, view.m);

  const panel =
    open && typeof document !== "undefined" ? (
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Elegir día de vencimiento"
        className="fixed z-[220] max-h-[min(85vh,calc(100dvh-16px))] overflow-y-auto rounded-2xl border border-slate-700/90 bg-slate-900 p-3 shadow-2xl shadow-black/40 ring-1 ring-slate-800/80"
        style={{
          top: panelPos.top,
          left: panelPos.left,
          width: panelPos.width,
        }}
      >
        <div
          className={`mb-2 flex items-center border-b border-slate-800/80 pb-2 ${lockMonth ? "justify-center" : "justify-between gap-1"}`}
        >
          {!lockMonth ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goPrevMonth();
              }}
              disabled={view.y <= MIN_Y && view.m <= 1}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-30"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : null}
          <div
            className={`flex min-w-0 flex-col items-center gap-0.5 text-center ${lockMonth ? "w-full px-1" : "flex-1"}`}
          >
            <div className="flex items-center justify-center gap-1 text-xs font-medium capitalize text-slate-200">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-blue-400/90" aria-hidden />
              <span className="truncate">{monthTitle(view.y, view.m)}</span>
            </div>
            <span className="text-[10px] text-slate-500">
              {lockMonth ? "Elegí el día de corte" : "Elegí el día (cada mes)"}
            </span>
          </div>
          {!lockMonth ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goNextMonth();
              }}
              disabled={view.y >= MAX_Y && view.m >= 12}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-30"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => {
            onChange("");
            setOpen(false);
          }}
          className="mb-2 w-full rounded-lg border border-slate-700/60 bg-slate-800/40 py-2 text-xs font-medium text-slate-400 transition hover:border-slate-600 hover:bg-slate-800 hover:text-slate-200"
        >
          Sin día fijo
        </button>

        <div className="mb-1.5 grid grid-cols-7 gap-0.5 text-center">
          {WEEKDAYS_MON_FIRST.map((d) => (
            <div key={d} className="text-[10px] font-medium uppercase tracking-wide text-slate-600">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) =>
            d == null ? (
              <div key={`e-${i}`} className="h-8" aria-hidden />
            ) : (
              <button
                key={`${view.y}-${view.m}-${d}`}
                type="button"
                onClick={() => {
                  onChange(String(d));
                  setOpen(false);
                }}
                className={`flex h-8 w-full items-center justify-center rounded-lg text-xs font-medium transition ${
                  selected === d
                    ? "bg-blue-600 text-white shadow-md shadow-blue-900/30"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {d}
              </button>
            )
          )}
        </div>

        {selected != null && selected > lastInView && (
          <p className="mt-2 text-[10px] leading-snug text-slate-500">
            Tenés elegido el día {selected}. En {monthTitle(view.y, view.m)} no existe; mostrá otro mes
            para verlo resaltado o cambiá el día.
          </p>
        )}
      </div>
    ) : null;

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        ref={btnRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={(e) => {
          e.preventDefault();
          if (disabled) return;
          setOpen((o) => !o);
        }}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border-0 bg-slate-900/80 px-3 py-2.5 text-left text-sm text-white ring-1 ring-slate-800 transition hover:ring-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${triggerClassName}`}
      >
        <span className="truncate text-slate-200">{label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
