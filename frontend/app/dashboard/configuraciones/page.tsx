"use client";

import { useEffect, useState } from "react";
import {
  Settings, User, Lock, Globe,
  CheckCircle, AlertCircle, Mail, Pencil,
  CreditCard, X,
} from "lucide-react";
import { updateMe } from "@/lib/api";
import { useUser } from "@/lib/UserContext";
import { normalizeCreditCardBanks, type CreditCardBankEntry } from "@/lib/types";
import NthBusinessDaySelect from "@/components/NthBusinessDaySelect";
import CutoffWeekdayPicker from "@/components/CutoffWeekdayPicker";

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

  const [bankInput, setBankInput] = useState("");
  const [bankDueMode, setBankDueMode] = useState<"calendar" | "business">("business");
  const [bankCalendarDay, setBankCalendarDay] = useState("");
  const [bankBusinessNth, setBankBusinessNth] = useState("10");
  const [bankCutMode, setBankCutMode] = useState<"none" | "calendar" | "weekday">("none");
  const [bankCutDay, setBankCutDay] = useState("");
  const [bankCutWeekday, setBankCutWeekday] = useState("");
  const [bankCutNth, setBankCutNth] = useState("");
  const [savingBanks, setSavingBanks] = useState(false);

  const [addBankOpen, setAddBankOpen] = useState(false);

  const [editBank, setEditBank] = useState<CreditCardBankEntry | null>(null);
  const [editDueMode, setEditDueMode] = useState<"calendar" | "business">("business");
  const [editCalendarDay, setEditCalendarDay] = useState("");
  const [editBusinessNth, setEditBusinessNth] = useState("10");
  const [editCutMode, setEditCutMode] = useState<"none" | "calendar" | "weekday">("none");
  const [editCutDay, setEditCutDay] = useState("");
  const [editCutWeekday, setEditCutWeekday] = useState("");
  const [editCutNth, setEditCutNth] = useState("");

  const creditBanks = normalizeCreditCardBanks(user?.credit_card_banks ?? []);

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

  async function handleAddBank(e: React.FormEvent) {
    e.preventDefault();
    const name = bankInput.trim();
    if (!name) return;
    if (creditBanks.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
      showToast("error", "Ese banco ya está en la lista.");
      return;
    }
    const due_mode = bankDueMode;
    let due_day: number | null = null;
    let business_nth: number | null = null;
    if (due_mode === "calendar") {
      const raw = bankCalendarDay.trim();
      if (raw) {
        const d = parseInt(raw, 10);
        if (Number.isNaN(d) || d < 1 || d > 31) {
          showToast("error", "Día del mes: entre 1 y 31.");
          return;
        }
        due_day = d;
      }
    } else {
      const n = parseInt(bankBusinessNth, 10);
      if (Number.isNaN(n) || n < 1 || n > 23) {
        showToast("error", "Elegí un día hábil entre 1 y 23.");
        return;
      }
      business_nth = n;
    }
    const cut_mode = bankCutMode;
    let cut_day: number | null = null;
    let cut_weekday: number | null = null;
    let cut_weekday_nth: number | null = null;
    if (cut_mode === "calendar") {
      const raw = bankCutDay.trim();
      if (raw) {
        const d = parseInt(raw, 10);
        if (Number.isNaN(d) || d < 1 || d > 31) {
          showToast("error", "Día de corte: usá un número entre 1 y 31.");
          return;
        }
        cut_day = d;
      } else {
        showToast("error", "Indicá el día de corte (1–31).");
        return;
      }
    } else if (cut_mode === "weekday") {
      const nthRaw = bankCutNth.trim();
      const wdRaw = bankCutWeekday.trim();
      const n = parseInt(nthRaw, 10);
      const wd = parseInt(wdRaw, 10);
      if (Number.isNaN(n) || n < 1 || n > 4) {
        showToast("error", "Corte: elegí 1º a 4º.");
        return;
      }
      if (Number.isNaN(wd) || wd < 0 || wd > 4) {
        showToast("error", "Corte: elegí un día hábil (lun–vie).");
        return;
      }
      cut_weekday_nth = n;
      cut_weekday = wd;
    }
    const newEntry: CreditCardBankEntry = {
      name,
      due_mode,
      due_day,
      business_nth,
      cut_mode,
      cut_day,
      cut_weekday,
      cut_weekday_nth,
    };
    setSavingBanks(true);
    try {
      const updated = await updateMe({ credit_card_banks: [...creditBanks, newEntry] });
      setUser(updated);
      setBankInput("");
      setBankCalendarDay("");
      setBankBusinessNth("10");
      setBankDueMode("business");
      setBankCutMode("none");
      setBankCutDay("");
      setBankCutWeekday("");
      setBankCutNth("");
      setAddBankOpen(false);
      showToast("success", "Banco agregado.");
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSavingBanks(false);
    }
  }

  function openAddBank() {
    setBankInput("");
    setBankDueMode("business");
    setBankCalendarDay("");
    setBankBusinessNth("10");
    setBankCutMode("none");
    setBankCutDay("");
    setBankCutWeekday("");
    setBankCutNth("");
    setAddBankOpen(true);
  }

  function closeAddBank() {
    if (savingBanks) return;
    setAddBankOpen(false);
  }

  async function handleRemoveBank(bankName: string) {
    setSavingBanks(true);
    try {
      const updated = await updateMe({
        credit_card_banks: creditBanks.filter((b) => b.name !== bankName),
      });
      setUser(updated);
      showToast("success", "Banco quitado de la lista.");
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSavingBanks(false);
    }
  }

  function openEditBank(b: CreditCardBankEntry) {
    setEditBank(b);
    setEditDueMode(b.due_mode === "calendar" ? "calendar" : "business");
    setEditCalendarDay(b.due_day != null ? String(b.due_day) : "");
    setEditBusinessNth(b.business_nth != null ? String(b.business_nth) : "10");
    setEditCutMode(b.cut_mode ?? "none");
    setEditCutDay(b.cut_day != null ? String(b.cut_day) : "");
    setEditCutWeekday(b.cut_weekday != null ? String(b.cut_weekday) : "");
    setEditCutNth(b.cut_weekday_nth != null ? String(b.cut_weekday_nth) : "");
  }

  function closeEditBank() {
    if (savingBanks) return;
    setEditBank(null);
  }

  async function handleSaveEditBank(e: React.FormEvent) {
    e.preventDefault();
    if (!editBank) return;
    const due_mode = editDueMode;
    let due_day: number | null = null;
    let business_nth: number | null = null;
    if (due_mode === "calendar") {
      const raw = editCalendarDay.trim();
      if (raw) {
        const d = parseInt(raw, 10);
        if (Number.isNaN(d) || d < 1 || d > 31) {
          showToast("error", "Día del mes: entre 1 y 31.");
          return;
        }
        due_day = d;
      }
    } else {
      const n = parseInt(editBusinessNth, 10);
      if (Number.isNaN(n) || n < 1 || n > 23) {
        showToast("error", "Elegí un día hábil entre 1 y 23.");
        return;
      }
      business_nth = n;
    }
    const cut_mode = editCutMode;
    let cut_day: number | null = null;
    let cut_weekday: number | null = null;
    let cut_weekday_nth: number | null = null;
    if (cut_mode === "calendar") {
      const raw = editCutDay.trim();
      if (!raw) {
        showToast("error", "Indicá el día de corte (1–31).");
        return;
      }
      const d = parseInt(raw, 10);
      if (Number.isNaN(d) || d < 1 || d > 31) {
        showToast("error", "Día de corte: entre 1 y 31.");
        return;
      }
      cut_day = d;
    } else if (cut_mode === "weekday") {
      const nthRaw = editCutNth.trim();
      const wdRaw = editCutWeekday.trim();
      const n = parseInt(nthRaw, 10);
      const wd = parseInt(wdRaw, 10);
      if (Number.isNaN(n) || n < 1 || n > 4) {
        showToast("error", "Corte: elegí 1º a 4º.");
        return;
      }
      if (Number.isNaN(wd) || wd < 0 || wd > 4) {
        showToast("error", "Corte: elegí un día hábil (lun–vie).");
        return;
      }
      cut_weekday_nth = n;
      cut_weekday = wd;
    }
    const updatedEntry: CreditCardBankEntry = {
      name: editBank.name,
      due_mode,
      due_day,
      business_nth,
      cut_mode,
      cut_day,
      cut_weekday,
      cut_weekday_nth,
    };
    setSavingBanks(true);
    try {
      const updated = await updateMe({
        credit_card_banks: creditBanks.map((b) =>
          b.name === editBank.name ? updatedEntry : b
        ),
      });
      setUser(updated);
      setEditBank(null);
      showToast("success", "Banco actualizado.");
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSavingBanks(false);
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

      {/* ── Tarjetas de crédito ── */}
      <Section
        icon={<CreditCard className="w-5 h-5 text-amber-400" />}
        title="Bancos con tarjeta de crédito"
        description="Definí el vencimiento del resumen: día hábil (típico) o día fijo del mes. En Finanzas te avisamos como con los gastos fijos (lun–vie; sin feriados)."
      >
        <p className="text-xs text-slate-500 leading-relaxed">
          Si no cargás ninguno, podés escribir el banco a mano al cargar el gasto. Si cargás bancos acá, el gasto te pedirá elegir uno de la lista.
        </p>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] text-slate-500 leading-snug">
            Día hábil: solo lunes a viernes (no cuenta sábados ni domingos ni feriados). Si tu banco usa otro criterio, elegí “Día fijo del calendario”.
          </p>
          <button
            type="button"
            onClick={openAddBank}
            disabled={savingBanks}
            className="shrink-0 h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition disabled:opacity-50"
          >
            Agregar banco
          </button>
        </div>
        {creditBanks.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no agregaste ningún banco.</p>
        ) : (
          <ul className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap">
            {creditBanks.map((b) => (
              <li
                key={b.name}
                className="flex w-max max-w-full min-h-0 items-start gap-2 rounded-lg border border-slate-600/90 bg-slate-700/40 px-3 py-2 text-sm text-slate-200 sm:max-w-md"
              >
                <div className="min-w-0 leading-snug">
                  <p className="font-medium text-white">{b.name}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                    {b.due_mode === "business" && b.business_nth != null
                      ? `Resumen: ${b.business_nth}º día hábil`
                      : b.due_day != null
                        ? `Resumen el día ${b.due_day} del mes`
                        : "Sin fecha de resumen"}
                    {" · "}
                    {b.cut_mode === "weekday" && b.cut_weekday_nth != null && b.cut_weekday != null
                      ? `Corte: ${b.cut_weekday_nth}º ${
                          ["lunes", "martes", "miércoles", "jueves", "viernes"][b.cut_weekday] ?? "día"
                        } hábil`
                      : b.cut_mode === "calendar" && b.cut_day != null
                        ? `Corte: día ${b.cut_day}`
                        : "Corte: sin corte"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={savingBanks}
                  onClick={() => openEditBank(b)}
                  className="-mr-1 -mt-0.5 shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-600/80 hover:text-amber-300 disabled:opacity-50"
                  aria-label={`Editar ${b.name}`}
                  title="Editar vencimiento"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={savingBanks}
                  onClick={() => handleRemoveBank(b.name)}
                  className="-mr-1 -mt-0.5 shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-600/80 hover:text-red-400 disabled:opacity-50"
                  aria-label={`Quitar ${b.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Modal editar banco */}
        {editBank && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/65 backdrop-blur-sm"
              onClick={savingBanks ? undefined : closeEditBank}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-cc-bank-title"
              className="relative w-full max-w-lg bg-[#1e293b] border border-slate-600/80 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 px-5 sm:px-6 py-4 border-b border-slate-700/50 bg-slate-800/40">
                <div className="min-w-0">
                  <h3 id="edit-cc-bank-title" className="text-base font-semibold text-white truncate">
                    Editar banco: {editBank.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Solo editás el vencimiento del resumen (el nombre no se cambia).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeEditBank}
                  disabled={savingBanks}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEditBank} className="p-5 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-3 items-end">
                  <div className="min-w-0">
                    <label className="block text-xs font-medium text-slate-400 mb-1.5" htmlFor="edit-cc-due-mode">
                      Tipo de vencimiento
                    </label>
                    <select
                      id="edit-cc-due-mode"
                      value={editDueMode}
                      onChange={(e) => setEditDueMode(e.target.value as "calendar" | "business")}
                      className="h-11 w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    >
                      <option value="business">N-ésimo día hábil (lun–vie)</option>
                      <option value="calendar">Día fijo del calendario (1–31)</option>
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label className="block text-xs font-medium text-slate-400 mb-1.5" htmlFor="edit-cc-due-value">
                      {editDueMode === "business" ? "Qué día hábil" : "Día del mes"}
                    </label>
                    {editDueMode === "business" ? (
                      <NthBusinessDaySelect
                        id="edit-cc-due-value"
                        value={editBusinessNth}
                        onChange={setEditBusinessNth}
                      />
                    ) : (
                      <input
                        id="edit-cc-due-value"
                        type="number"
                        min={1}
                        max={31}
                        inputMode="numeric"
                        value={editCalendarDay}
                        onChange={(e) => setEditCalendarDay(e.target.value)}
                        placeholder="Opcional"
                        className="h-11 w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      />
                    )}
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-400 mb-1.5" htmlFor="edit-cc-cut-mode">
                      Fecha de corte (cierre)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-2 items-center">
                      <select
                        id="edit-cc-cut-mode"
                        value={editCutMode}
                        onChange={(e) => setEditCutMode(e.target.value as "none" | "calendar" | "weekday")}
                        className="h-11 w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      >
                        <option value="none">Sin corte (legacy)</option>
                        <option value="weekday">N-ésimo día de semana hábil (ej. 2º jueves)</option>
                        <option value="calendar">Día fijo del mes (1–31)</option>
                      </select>
                      {editCutMode === "weekday" ? (
                        <CutoffWeekdayPicker
                          weekday={editCutWeekday}
                          nth={editCutNth}
                          onWeekdayChange={setEditCutWeekday}
                          onNthChange={setEditCutNth}
                          ids={{ weekday: "edit-cc-cut-weekday", nth: "edit-cc-cut-nth" }}
                        />
                      ) : editCutMode === "calendar" ? (
                        <input
                          id="edit-cc-cut-day"
                          type="number"
                          min={1}
                          max={31}
                          inputMode="numeric"
                          value={editCutDay}
                          onChange={(e) => setEditCutDay(e.target.value)}
                          placeholder="Ej: 19"
                          className="h-11 w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                        />
                      ) : (
                        <div className="h-11 flex items-center px-4 text-sm text-slate-400 bg-slate-700/30 border border-slate-700 rounded-xl">
                          La cuota 1 vence el mes siguiente a la compra
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeEditBank}
                    disabled={savingBanks}
                    className="px-4 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/80 text-sm font-medium transition disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <SaveButton loading={savingBanks} label="Guardar cambios" />
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal agregar banco (reusa estilo del de editar) */}
        {addBankOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/65 backdrop-blur-sm"
              onClick={savingBanks ? undefined : closeAddBank}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-cc-bank-title"
              className="relative w-full max-w-lg bg-[#1e293b] border border-slate-600/80 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 px-5 sm:px-6 py-4 border-b border-slate-700/50 bg-slate-800/40">
                <div className="min-w-0">
                  <h3 id="add-cc-bank-title" className="text-base font-semibold text-white truncate">
                    Agregar banco
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Definí vencimiento del resumen y fecha de corte (cierre).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAddBank}
                  disabled={savingBanks}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleAddBank} className="p-5 sm:p-6 space-y-4">
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5" htmlFor="add-cc-bank-name">
                    Nombre del banco
                  </label>
                  <input
                    id="add-cc-bank-name"
                    type="text"
                    value={bankInput}
                    onChange={(e) => setBankInput(e.target.value)}
                    placeholder="Ej: Galicia, Santander…"
                    className="h-11 w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-3 items-end">
                  <div className="min-w-0">
                    <label className="block text-xs font-medium text-slate-400 mb-1.5" htmlFor="add-cc-due-mode">
                      Tipo de vencimiento
                    </label>
                    <select
                      id="add-cc-due-mode"
                      value={bankDueMode}
                      onChange={(e) => setBankDueMode(e.target.value as "calendar" | "business")}
                      className="h-11 w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      <option value="business">N-ésimo día hábil (lun–vie)</option>
                      <option value="calendar">Día fijo del calendario (1–31)</option>
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label className="block text-xs font-medium text-slate-400 mb-1.5" htmlFor="add-cc-due-value">
                      {bankDueMode === "business" ? "Qué día hábil" : "Día del mes"}
                    </label>
                    {bankDueMode === "business" ? (
                      <NthBusinessDaySelect
                        id="add-cc-due-value"
                        value={bankBusinessNth}
                        onChange={setBankBusinessNth}
                      />
                    ) : (
                      <input
                        id="add-cc-due-value"
                        type="number"
                        min={1}
                        max={31}
                        inputMode="numeric"
                        value={bankCalendarDay}
                        onChange={(e) => setBankCalendarDay(e.target.value)}
                        placeholder="Opcional"
                        className="h-11 w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    )}
                  </div>
                </div>

                <div className="min-w-0">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5" htmlFor="add-cc-cut-mode">
                    Fecha de corte (cierre)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-2 items-center">
                    <select
                      id="add-cc-cut-mode"
                      value={bankCutMode}
                      onChange={(e) => setBankCutMode(e.target.value as "none" | "calendar" | "weekday")}
                      className="h-11 w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      <option value="none">Sin corte (legacy)</option>
                      <option value="weekday">N-ésimo día de semana hábil (ej. 2º jueves)</option>
                      <option value="calendar">Día fijo del mes (1–31)</option>
                    </select>
                    {bankCutMode === "weekday" ? (
                      <CutoffWeekdayPicker
                        weekday={bankCutWeekday}
                        nth={bankCutNth}
                        onWeekdayChange={setBankCutWeekday}
                        onNthChange={setBankCutNth}
                        ids={{ weekday: "add-cc-cut-weekday", nth: "add-cc-cut-nth" }}
                      />
                    ) : bankCutMode === "calendar" ? (
                      <input
                        id="add-cc-cut-day"
                        type="number"
                        min={1}
                        max={31}
                        inputMode="numeric"
                        value={bankCutDay}
                        onChange={(e) => setBankCutDay(e.target.value)}
                        placeholder="Ej: 19"
                        className="h-11 w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    ) : (
                      <div className="h-11 flex items-center px-4 text-sm text-slate-400 bg-slate-700/30 border border-slate-700 rounded-xl">
                        La cuota 1 vence el mes siguiente a la compra
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeAddBank}
                    disabled={savingBanks}
                    className="px-4 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/80 text-sm font-medium transition disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <SaveButton loading={savingBanks} label="Agregar" />
                </div>
              </form>
            </div>
          </div>
        )}
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
      className="inline-flex h-11 min-h-[2.75rem] items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 rounded-xl transition-all w-full sm:w-auto"
    >
      {loading ? (
        <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Guardando...</>
      ) : label}
    </button>
  );
}
