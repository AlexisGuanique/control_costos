"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plane, Plus, MapPin, Calendar, Users, Wallet,
  CheckCircle, Clock, ChevronRight,
} from "lucide-react";
import { DatePickerField } from "@/components/MiniCalendar";
import { listTrips, createTrip } from "@/lib/api";
import type { Trip, TripCreate } from "@/lib/types";

const CURRENCIES = [
  { code: "ARS", flag: "🇦🇷" },
  { code: "USD", flag: "🇺🇸" },
  { code: "EUR", flag: "🇪🇺" },
];

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "ARS" ? "ARS" : currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function ViajesPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    listTrips()
      .then(setTrips)
      .finally(() => setLoading(false));
  }, []);

  function handleCreated(trip: Trip) {
    setTrips((prev) => [trip, ...prev]);
    setShowCreate(false);
    router.push(`/dashboard/viajes/${trip.id}`);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Plane className="w-7 h-7 text-blue-400" />
            Gestión de Viajes
          </h1>
          <p className="text-slate-300 text-sm mt-0.5">
            Coordiná gastos compartidos con otros viajeros
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/20"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nuevo viaje</span>
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-52 rounded-2xl bg-slate-800/50 animate-pulse border border-slate-700/30" />
          ))}
        </div>
      ) : trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-20 h-20 rounded-3xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Plane className="w-10 h-10 text-blue-400 opacity-60" />
          </div>
          <div>
            <p className="text-lg font-semibold text-white">No tenés viajes todavía</p>
            <p className="text-slate-300 text-sm mt-1">
              Creá un viaje e invitá a tus compañeros para dividir los gastos fácilmente.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl transition-all mt-2"
          >
            <Plus className="w-5 h-5" /> Crear mi primer viaje
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} onClick={() => router.push(`/dashboard/viajes/${trip.id}`)} />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateTripModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}

function TripCard({ trip, onClick }: { trip: Trip; onClick: () => void }) {
  const isActive = trip.status === "Activo";
  return (
    <button
      onClick={onClick}
      className="text-left bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-blue-500/40 rounded-2xl p-5 transition-all group flex flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-white text-lg leading-tight truncate">{trip.name}</p>
          {trip.destination && (
            <p className="text-slate-300 text-sm mt-0.5 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              {trip.destination}
            </p>
          )}
        </div>
        <span className={`shrink-0 flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${
          isActive
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            : "bg-slate-500/10 text-slate-300 border-slate-500/20"
        }`}>
          {isActive ? <Clock className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
          {trip.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {trip.start_date && (
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{trip.start_date}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-slate-300">
          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {trip.member_count} participante{trip.member_count !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-700/50">
        <div>
          <p className="text-xs text-slate-400">Total gastado</p>
          <p className="text-lg font-bold text-white">{formatAmount(trip.total_amount, trip.currency)}</p>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-blue-400 transition-colors" />
      </div>
    </button>
  );
}

function CreateTripModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (trip: Trip) => void;
}) {
  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate]     = useState("");
  const [endDate, setEndDate]         = useState("");
  const [currency, setCurrency]       = useState("ARS");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data: TripCreate = {
        name: name.trim(),
        description: description.trim() || undefined,
        destination: destination.trim() || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        currency,
      };
      const trip = await createTrip(data);
      onCreated(trip);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear el viaje");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-[#1e293b] rounded-t-3xl sm:rounded-2xl border border-slate-700/80 shadow-2xl overflow-visible">
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-600" />
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <Plane className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="font-semibold text-white">Nuevo viaje</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-700 transition">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-visible">
          <FormField label="Nombre del viaje *" value={name} onChange={setName} placeholder="Ej: Bariloche 2026" required />
          <FormField label="Destino" value={destination} onChange={setDestination} placeholder="Ej: Bariloche, Río Negro" icon={<MapPin className="w-4 h-4" />} />
          <FormField label="Descripción" value={description} onChange={setDescription} placeholder="Opcional..." />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DatePickerField
              label="Fecha de salida"
              value={startDate}
              onChange={setStartDate}
              maxDate={endDate || undefined}
              placeholder="Elegí la salida"
            />
            <DatePickerField
              label="Fecha de regreso"
              value={endDate}
              onChange={setEndDate}
              minDate={startDate || undefined}
              placeholder="Elegí el regreso"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">Moneda del viaje</label>
            <div className="flex gap-2">
              {CURRENCIES.map((c) => (
                <button key={c.code} type="button" onClick={() => setCurrency(c.code)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    currency === c.code
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "bg-slate-700/40 border-slate-600 text-slate-200 hover:text-white"
                  }`}>
                  {c.flag} {c.code}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-200 hover:text-white text-sm font-medium transition">
              Cancelar
            </button>
            <button type="submit" disabled={loading || !name.trim()}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-semibold transition flex items-center justify-center gap-2">
              {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
              {loading ? "Creando..." : "Crear viaje"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder, required, icon }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; icon?: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>}
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} required={required}
          className={`w-full bg-slate-700/60 border border-slate-600 rounded-xl py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${icon ? "pl-10 pr-4" : "px-4"}`}
        />
      </div>
    </div>
  );
}
