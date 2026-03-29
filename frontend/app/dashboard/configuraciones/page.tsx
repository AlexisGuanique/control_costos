"use client";

import { useEffect, useState } from "react";
import {
  Settings, User, Lock, Globe,
  CheckCircle, AlertCircle, Mail, Pencil,
} from "lucide-react";
import { updateMe } from "@/lib/api";
import { useUser } from "@/lib/UserContext";

type ToastType = "success" | "error";
interface Toast { type: ToastType; message: string }

const CURRENCIES = [
  { code: "ARS", label: "Peso Argentino",        flag: "🇦🇷" },
  { code: "USD", label: "Dólar Estadounidense",   flag: "🇺🇸" },
  { code: "EUR", label: "Euro",                   flag: "🇪🇺" },
];

export default function ConfiguracionesPage() {
  const { user, setUser } = useUser();
  const [toast, setToast] = useState<Toast | null>(null);

  const [fullName, setFullName]         = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currency, setCurrency]           = useState("ARS");
  const [savingCurrency, setSavingCurrency] = useState(false);

  const [currentPw, setCurrentPw]   = useState("");
  const [newPw, setNewPw]           = useState("");
  const [confirmPw, setConfirmPw]   = useState("");
  const [savingPw, setSavingPw]     = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
      setCurrency(user.base_currency);
    }
  }, [user]);

  function showToast(type: ToastType, message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    setSavingProfile(true);
    try {
      const updated = await updateMe({ full_name: fullName.trim() });
      setUser(updated);
      showToast("success", "Nombre actualizado correctamente.");
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveCurrency(e: React.FormEvent) {
    e.preventDefault();
    setSavingCurrency(true);
    try {
      const updated = await updateMe({ base_currency: currency });
      setUser(updated);
      showToast("success", `Moneda base cambiada a ${currency}. Aplica a nuevos gastos.`);
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSavingCurrency(false);
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) { showToast("error", "Las contraseñas no coinciden."); return; }
    if (newPw.length < 8)    { showToast("error", "Mínimo 8 caracteres."); return; }
    setSavingPw(true);
    try {
      await updateMe({ current_password: currentPw, new_password: newPw });
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      showToast("success", "Contraseña actualizada correctamente.");
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Error al cambiar contraseña");
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-8 text-slate-100 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="w-7 h-7 text-slate-400" />
          Configuraciones
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Perfil, preferencias y seguridad de tu cuenta
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
          toast.type === "success"
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            : "bg-red-500/10 border-red-500/30 text-red-400"
        }`}>
          {toast.type === "success"
            ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          {toast.message}
        </div>
      )}

      {/* ── Perfil ── */}
      <Section
        icon={<User className="w-5 h-5 text-blue-400" />}
        title="Perfil"
        description="Tu información personal en la plataforma"
      >
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Email (no modificable)
          </label>
          <div className="flex items-center gap-2 bg-slate-700/40 border border-slate-700 rounded-xl px-4 py-3 text-slate-400 text-sm">
            <Mail className="w-4 h-4 shrink-0" />
            {user?.email ?? "—"}
          </div>
        </div>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Nombre completo
            </label>
            <div className="relative">
              <Pencil className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Tu nombre"
                required
                className="w-full bg-slate-700/60 border border-slate-600 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>
          </div>
          <SaveButton loading={savingProfile} label="Guardar nombre" />
        </form>
      </Section>

      {/* ── Moneda base ── */}
      <Section
        icon={<Globe className="w-5 h-5 text-emerald-400" />}
        title="Moneda base"
        description="Todos los gastos en moneda extranjera se convierten a esta usando la cotización del momento"
      >
        <form onSubmit={handleSaveCurrency} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {CURRENCIES.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setCurrency(c.code)}
                className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                  currency === c.code
                    ? "bg-blue-600/15 border-blue-500/60 text-white shadow-lg shadow-blue-500/10"
                    : "bg-slate-700/30 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white"
                }`}
              >
                <span className="text-2xl">{c.flag}</span>
                <div>
                  <p className="font-semibold text-sm">{c.code}</p>
                  <p className="text-xs text-slate-400 leading-tight">{c.label}</p>
                </div>
                {currency === c.code && (
                  <CheckCircle className="w-4 h-4 text-blue-400 ml-auto shrink-0" />
                )}
              </button>
            ))}
          </div>
          {currency !== user?.base_currency && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              Los gastos ya registrados no se reconvierten. El cambio aplica a nuevos registros.
            </div>
          )}
          <SaveButton loading={savingCurrency} label="Guardar moneda" />
        </form>
      </Section>

      {/* ── Seguridad ── */}
      <Section
        icon={<Lock className="w-5 h-5 text-purple-400" />}
        title="Seguridad"
        description="Cambiá tu contraseña de acceso"
      >
        <form onSubmit={handleSavePassword} className="space-y-4">
          <PwField label="Contraseña actual" value={currentPw} onChange={setCurrentPw} placeholder="••••••••" />
          <div className="grid sm:grid-cols-2 gap-4">
            <PwField label="Nueva contraseña"           value={newPw}     onChange={setNewPw}     placeholder="Mín. 8 caracteres" />
            <PwField label="Confirmar nueva contraseña" value={confirmPw} onChange={setConfirmPw} placeholder="Repetí la contraseña" />
          </div>
          {newPw && confirmPw && newPw !== confirmPw && (
            <p className="text-red-400 text-xs flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Las contraseñas no coinciden
            </p>
          )}
          <SaveButton loading={savingPw} label="Cambiar contraseña" />
        </form>
      </Section>
    </div>
  );
}

function Section({ icon, title, description, children }: {
  icon: React.ReactNode; title: string; description: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-6 space-y-5">
      <div className="flex items-start gap-3 pb-4 border-b border-slate-700/50">
        <div className="w-9 h-9 rounded-xl bg-slate-700/60 flex items-center justify-center shrink-0">{icon}</div>
        <div>
          <h2 className="font-semibold text-white">{title}</h2>
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function PwField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
      />
    </div>
  );
}

function SaveButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all"
    >
      {loading ? (
        <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Guardando...</>
      ) : label}
    </button>
  );
}
