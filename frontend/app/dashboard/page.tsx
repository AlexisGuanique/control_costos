"use client";

import { useEffect, useState, useCallback } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  Receipt, RefreshCw, BarChart3, TrendingUp, TrendingDown,
  DollarSign, ArrowUpRight, ArrowDownRight, Clock,
} from "lucide-react";
import { getStats, getRates } from "@/lib/api";
import { useUser } from "@/lib/UserContext";
import type { ExpenseStats, DollarRate } from "@/lib/types";

const CATEGORY_COLORS: Record<string, string> = {
  Comidas: "#10b981",
  Delivery: "#84cc16",
  Salidas: "#d946ef",
  Viajes: "#38bdf8",
  Auto: "#f59e0b",
  Hogar: "#14b8a6",
  Familia: "#fb7185",
  "Educación": "#818cf8",
  Deporte: "#22d3ee",
  Belleza: "#f472b6",
  Ropa: "#a78bfa",
  Mascotas: "#fb923c",
  Regalos: "#f87171",
  Suscripciones: "#a855f7",
  Salud: "#ef4444",
  Otro: "#64748b",
};

// Mapa de casa → nombre visible y color
const RATE_META: Record<string, { label: string; color: string; bg: string }> = {
  blue:            { label: "Dólar Blue",    color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20" },
  oficial:         { label: "Dólar Oficial", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  bolsa:           { label: "Dólar MEP",     color: "text-purple-400",  bg: "bg-purple-500/10 border-purple-500/20" },
  contadoconliqui: { label: "Dólar CCL",     color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20" },
  cripto:          { label: "Dólar Cripto",  color: "text-pink-400",    bg: "bg-pink-500/10 border-pink-500/20" },
  tarjeta:         { label: "Dólar Tarjeta", color: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/20" },
};

const PRIORITY_ORDER = ["blue", "oficial", "bolsa", "contadoconliqui", "cripto", "tarjeta"];

function formatARS(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0,
  }).format(n);
}

function formatRate(n: number | null) {
  if (n === null) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0,
  }).format(n);
}

function timeAgo(isoDate: string): string {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
  if (diff < 1) return "ahora mismo";
  if (diff < 60) return `hace ${diff} min`;
  const h = Math.floor(diff / 60);
  return `hace ${h}h`;
}

export default function DashboardPage() {
  const { user } = useUser();
  const [stats, setStats] = useState<ExpenseStats | null>(null);
  const [rates, setRates] = useState<DollarRate[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingRates, setLoadingRates] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ratesError, setRatesError] = useState(false);

  const baseCurrency = user?.base_currency ?? "ARS";

  const loadAll = useCallback(async () => {
    setRatesError(false);
    await Promise.allSettled([
      getStats()
        .then(setStats)
        .finally(() => setLoadingStats(false)),
      getRates()
        .then((data) => {
          const sorted = PRIORITY_ORDER
            .map((casa) => data.find((r) => r.casa === casa))
            .filter(Boolean) as DollarRate[];
          setRates(sorted);
        })
        .catch(() => setRatesError(true))
        .finally(() => setLoadingRates(false)),
    ]);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  function handleRefresh() {
    setRefreshing(true);
    setLoadingRates(true);
    loadAll();
  }

  const pieData = stats
    ? Object.entries(stats.by_category).map(([name, value]) => ({ name, value }))
    : [];

  const barData = pieData
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const topCategory = barData[0] ?? null;

  return (
    <div className="p-6 lg:p-8 space-y-8 text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-300 text-sm mt-0.5">
            Resumen financiero · {new Date().toLocaleDateString("es-AR", { month: "long", year: "numeric" })}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 text-sm text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 rounded-xl transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Actualizar</span>
        </button>
      </div>

      {/* ── Cotizaciones en vivo ─────────────────────────────────────────── */}
      <section>
        <h2 className="font-semibold text-white mb-3 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-emerald-400" />
          Cotizaciones en vivo
          <span className="ml-auto text-xs text-slate-400 font-normal flex items-center gap-1">
            <Clock className="w-3 h-3" /> DolarAPI
          </span>
        </h2>

        {loadingRates ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-slate-800/50 animate-pulse border border-slate-700/50" />
            ))}
          </div>
        ) : ratesError ? (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm">
            No se pudieron cargar las cotizaciones. Verificá que el backend esté activo.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {rates.map((rate) => {
              const meta = RATE_META[rate.casa] ?? {
                label: rate.nombre, color: "text-slate-200", bg: "bg-slate-700/40 border-slate-700",
              };
              return (
                <div
                  key={rate.casa}
                  className={`rounded-2xl p-4 border flex flex-col gap-2 ${meta.bg}`}
                >
                  <p className={`text-xs font-semibold uppercase tracking-wide ${meta.color}`}>
                    {meta.label}
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                        <ArrowDownRight className="w-3 h-3 text-emerald-500" /> Compra
                      </span>
                      <span className="text-xs font-semibold text-slate-200">
                        {formatRate(rate.compra)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                        <ArrowUpRight className="w-3 h-3 text-red-400" /> Venta
                      </span>
                      <span className="text-sm font-bold text-white">
                        {formatRate(rate.venta)}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-none mt-auto">
                    {timeAgo(rate.fechaActualizacion)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Stats cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Gasto total del mes"
          value={loadingStats ? "..." : formatARS(stats?.total_month_base ?? 0)}
          subtitle={`moneda base: ${baseCurrency}`}
          icon={<Receipt className="w-6 h-6 text-blue-400" />}
          accent="blue"
        />
        <StatCard
          title="Transacciones"
          value={loadingStats ? "..." : String(stats?.total_expenses ?? 0)}
          subtitle="registradas este mes"
          icon={<BarChart3 className="w-6 h-6 text-emerald-400" />}
          accent="emerald"
        />
        <StatCard
          title="Categoría principal"
          value={loadingStats ? "..." : (topCategory?.name ?? "—")}
          subtitle={topCategory ? formatARS(topCategory.value) : "sin datos"}
          icon={<TrendingUp className="w-6 h-6 text-purple-400" />}
          accent="purple"
        />
      </div>

      {/* ── Gráficos ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart */}
        <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-6">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            Distribución por categoría
          </h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value">
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] ?? "#64748b"} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [formatARS(v), "Total"]}
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "12px", color: "#f1f5f9" }}
                />
                <Legend formatter={(v) => <span style={{ color: "#94a3b8", fontSize: "12px" }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </div>

        {/* Bar chart */}
        <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-6">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-purple-400" />
            Gasto por categoría ({baseCurrency})
          </h2>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: number) => [formatARS(v), "Total"]}
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "12px", color: "#f1f5f9" }}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {barData.map((entry) => (
                    <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] ?? "#64748b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-[260px] flex flex-col items-center justify-center text-slate-500 gap-2">
      <BarChart3 className="w-10 h-10 opacity-30" />
      <p className="text-sm">Sin gastos este mes</p>
    </div>
  );
}

function StatCard({
  title, value, subtitle, icon, accent,
}: {
  title: string; value: string; subtitle: string; icon: React.ReactNode;
  accent: "blue" | "emerald" | "purple";
}) {
  const cls = {
    blue: "bg-blue-500/10 border-blue-500/20",
    emerald: "bg-emerald-500/10 border-emerald-500/20",
    purple: "bg-purple-500/10 border-purple-500/20",
  };
  return (
    <div className={`rounded-2xl p-5 border flex items-start gap-4 ${cls[accent]}`}>
      <div className="w-12 h-12 rounded-xl bg-slate-800/60 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-slate-400">{title}</p>
        <p className="text-2xl font-bold text-white mt-0.5 truncate">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}
