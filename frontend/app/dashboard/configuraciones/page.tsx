"use client";

import { useEffect, useState } from "react";
import {
  Settings, User, Lock, Globe,
  CheckCircle, AlertCircle, Mail, Pencil,
  CreditCard, X,
} from "lucide-react";
import { listCreditCardCutoffs, updateMe, upsertCreditCardCutoff, getCreditCardBankExpenseCount, deleteCreditCardBank } from "@/lib/api";
import { formatISODateOnlyLocal } from "@/lib/dateDisplay";
import { useUser } from "@/lib/UserContext";
import { normalizeCreditCardBanks, type CreditCardBankEntry, type CreditCardCutoffOverride } from "@/lib/types";
import NthBusinessDaySelect from "@/components/NthBusinessDaySelect";
import DayOfMonthPicker from "@/components/DayOfMonthPicker";

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
  const [savingBanks, setSavingBanks] = useState(false);

  const [addBankOpen, setAddBankOpen] = useState(false);

  const [editBank, setEditBank] = useState<CreditCardBankEntry | null>(null);
  const [editDueMode, setEditDueMode] = useState<"calendar" | "business">("business");
  const [editCalendarDay, setEditCalendarDay] = useState("");
  const [editBusinessNth, setEditBusinessNth] = useState("10");

  const [cutoffYear, setCutoffYear] = useState<number>(new Date().getFullYear());
  const [cutoffMonth, setCutoffMonth] = useState<number>(new Date().getMonth() + 1);
  const [cutoffDay, setCutoffDay] = useState<string>("");
  const [cutoffHistory, setCutoffHistory] = useState<CreditCardCutoffOverride[]>([]);
  const [savingCutoff, setSavingCutoff] = useState(false);

  // ── Eliminar banco (con modal de confirmación) ─────────────────────────────
  const [deleteBankTarget, setDeleteBankTarget] = useState<string | null>(null);
  const [deleteBankExpenseCount, setDeleteBankExpenseCount] = useState<number | null>(null);
  const [deleteBankLoading, setDeleteBankLoading] = useState(false);
  const [deleteBankConfirming, setDeleteBankConfirming] = useState(false);

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
    const newEntry: CreditCardBankEntry = {
      name,
      due_mode,
      due_day,
      business_nth,
      cut_mode: "none",
      cut_day: null,
      cut_weekday: null,
      cut_weekday_nth: null,
    };
    setSavingBanks(true);
    try {
      const updated = await updateMe({ credit_card_banks: [...creditBanks, newEntry] });
      setUser(updated);
      setBankInput("");
      setBankCalendarDay("");
      setBankBusinessNth("10");
      setBankDueMode("business");
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
    setAddBankOpen(true);
  }

  function closeAddBank() {
    if (savingBanks) return;
    setAddBankOpen(false);
  }

  async function openDeleteBankModal(bankName: string) {
    setDeleteBankTarget(bankName);
    setDeleteBankExpenseCount(null);
    setDeleteBankLoading(true);
    try {
      const { expense_count } = await getCreditCardBankExpenseCount(bankName);
      setDeleteBankExpenseCount(expense_count);
    } catch {
      setDeleteBankExpenseCount(0);
    } finally {
      setDeleteBankLoading(false);
    }
  }

  async function confirmDeleteBank() {
    if (!deleteBankTarget) return;
    setDeleteBankConfirming(true);
    try {
      const updated = await deleteCreditCardBank(deleteBankTarget);
      setUser(updated);
      showToast("success", `Banco "${deleteBankTarget}" y sus gastos fueron eliminados.`);
      setDeleteBankTarget(null);
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleteBankConfirming(false);
    }
  }

  function openEditBank(b: CreditCardBankEntry) {
    setEditBank(b);
    setEditDueMode(b.due_mode === "calendar" ? "calendar" : "business");
    setEditCalendarDay(b.due_day != null ? String(b.due_day) : "");
    setEditBusinessNth(b.business_nth != null ? String(b.business_nth) : "10");

    const now = new Date();
    setCutoffYear(now.getFullYear());
    setCutoffMonth(now.getMonth() + 1);
    setCutoffDay("");
    setCutoffHistory([]);
    void listCreditCardCutoffs({ bank: b.name }).then(setCutoffHistory).catch(() => {});
  }

  function closeEditBank() {
    if (savingBanks) return;
    setEditBank(null);
  }

  async function handleSaveMonthlyCutoff() {
    if (!editBank) return;
    const d = cutoffDay ? parseInt(cutoffDay, 10) : NaN;
    if (!Number.isFinite(d) || d < 1 || d > 31) {
      showToast("error", "Elegí un día de corte (1–31).");
      return;
    }
    const iso = `${cutoffYear}-${String(cutoffMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    setSavingCutoff(true);
    try {
      await upsertCreditCardCutoff({
        bank: editBank.name,
        year: cutoffYear,
        month: cutoffMonth,
        cut_date: iso,
      });
      const fresh = await listCreditCardCutoffs({ bank: editBank.name });
      setCutoffHistory(fresh);
      showToast("success", "Corte mensual guardado.");
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Error al guardar el corte");
    } finally {
      setSavingCutoff(false);
    }
  }

  async function handleDeleteMonthlyCutoff(y: number, m: number) {
    if (!editBank) return;
    setSavingCutoff(true);
    try {
      await upsertCreditCardCutoff({ bank: editBank.name, year: y, month: m, cut_date: null });
      const fresh = await listCreditCardCutoffs({ bank: editBank.name });
      setCutoffHistory(fresh);
      showToast("success", "Corte mensual eliminado.");
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Error al eliminar el corte");
    } finally {
      setSavingCutoff(false);
    }
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
    const updatedEntry: CreditCardBankEntry = {
      name: editBank.name,
      due_mode,
      due_day,
      business_nth,
      cut_mode: "none",
      cut_day: null,
      cut_weekday: null,
      cut_weekday_nth: null,
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
    <>
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
        description="Vencimiento del resumen (día hábil o día fijo). La fecha de cierre para cuotas la cargás por mes al editar cada banco."
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
                    Fecha de corte de cuotas: cargala por mes al editar
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
                  onClick={() => openDeleteBankModal(b.name)}
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
          <div className="fixed inset-0 z-[110] flex min-h-0 items-center justify-center p-3 sm:p-4">
            <div
              className="absolute inset-0 min-h-[100dvh] w-full bg-black/65 backdrop-blur-sm"
              onClick={savingBanks ? undefined : closeEditBank}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-cc-bank-title"
              className="relative flex max-h-[min(92dvh,100dvh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-600/80 bg-[#1e293b] shadow-2xl shadow-black/40"
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-700/50 bg-slate-800/40 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <h3 id="edit-cc-bank-title" className="truncate text-base font-semibold text-white">
                    Editar banco: {editBank.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Vencimiento del resumen y fecha de corte por mes (cuotas y gastos fijos con tarjeta).
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

              <form
                onSubmit={handleSaveEditBank}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:items-end">
                    <div className="min-w-0">
                      <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor="edit-cc-due-mode">
                        Tipo de vencimiento del resumen
                      </label>
                      <select
                        id="edit-cc-due-mode"
                        value={editDueMode}
                        onChange={(e) => setEditDueMode(e.target.value as "calendar" | "business")}
                        className="h-11 w-full rounded-xl border border-slate-600 bg-slate-700/60 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      >
                        <option value="business">N-ésimo día hábil (lun–vie)</option>
                        <option value="calendar">Día fijo del calendario (1–31)</option>
                      </select>
                    </div>

                    <div className="min-w-0">
                      <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor="edit-cc-due-value">
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
                          className="h-11 w-full rounded-xl border border-slate-600 bg-slate-700/60 px-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                        />
                      )}
                    </div>
                  </div>

                  <div className="mt-5 border-t border-slate-700/60 pt-5">
                    <h4 className="text-sm font-semibold text-white">Fecha de corte (por mes)</h4>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">
                      Es el día de cierre que usamos para saber si la compra entra en el cierre actual o en el
                      siguiente (cuotas en gastos y en Finanzas). Si no cargás un corte para ese mes, el sistema
                      usa por defecto el <span className="font-medium text-slate-200">4.º jueves</span> de ese mes
                      como referencia.
                    </p>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[4.5rem_6.25rem_minmax(11rem,1fr)_auto] sm:items-end">
                    <div className="min-w-0 sm:max-w-[4.5rem]">
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">Año</label>
                      <input
                        type="number"
                        min={2000}
                        max={2100}
                        value={cutoffYear}
                        onChange={(e) => setCutoffYear(parseInt(e.target.value || String(new Date().getFullYear()), 10))}
                        className="h-11 w-full min-w-0 bg-slate-700/60 border border-slate-600 rounded-xl px-2 text-white text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      />
                    </div>
                    <div className="min-w-0 sm:max-w-[6.25rem]">
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">Mes</label>
                      <select
                        value={cutoffMonth}
                        onChange={(e) => setCutoffMonth(parseInt(e.target.value, 10))}
                        className="h-11 w-full min-w-0 bg-slate-700/60 border border-slate-600 rounded-xl px-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0 sm:min-w-[11rem]">
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">Día de corte</label>
                      <DayOfMonthPicker
                        id="cc-monthly-cutoff-day"
                        value={cutoffDay}
                        onChange={setCutoffDay}
                        alignMonth={{ year: cutoffYear, month: cutoffMonth }}
                        lockMonth
                        triggerClassName="rounded-xl !ring-0 border border-slate-600 bg-slate-800/80 focus:ring-2 focus:ring-amber-500/40 min-w-0 w-full"
                      />
                    </div>
                    <div className="flex sm:justify-end">
                      <button
                        type="button"
                        onClick={handleSaveMonthlyCutoff}
                        disabled={savingBanks || savingCutoff}
                        className="h-11 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition disabled:opacity-50"
                      >
                        {savingCutoff ? "Guardando…" : "Guardar"}
                      </button>
                    </div>
                  </div>

                  {cutoffHistory.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {cutoffHistory.slice(0, 12).map((r) => (
                        <li
                          key={r.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-slate-700/60 bg-slate-800/40 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-slate-200">
                              {String(r.month).padStart(2, "0")}/{r.year} ·{" "}
                              <span className="font-semibold text-white">
                                {formatISODateOnlyLocal(r.cut_date)}
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-300">
                              Guardado: {new Date(r.created_at).toLocaleString("es-AR")}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteMonthlyCutoff(r.year, r.month)}
                            disabled={savingCutoff}
                            className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:text-white hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition disabled:opacity-50"
                          >
                            Eliminar
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-slate-300">
                      Todavía no hay cortes mensuales guardados para este banco.
                    </p>
                  )}
                  </div>
                </div>

                <div className="flex shrink-0 justify-end gap-2 border-t border-slate-700/50 bg-slate-900/30 px-5 py-3 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <button
                    type="button"
                    onClick={closeEditBank}
                    disabled={savingBanks}
                    className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-700/80 hover:text-white disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <SaveButton loading={savingBanks} label="Guardar cambios" />
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal agregar banco */}
        {addBankOpen && (
          <div className="fixed inset-0 z-[110] flex min-h-0 items-center justify-center p-3 sm:p-4">
            <div
              className="absolute inset-0 min-h-[100dvh] w-full bg-black/65 backdrop-blur-sm"
              onClick={savingBanks ? undefined : closeAddBank}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-cc-bank-title"
              className="relative flex max-h-[min(92dvh,100dvh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-600/80 bg-[#1e293b] shadow-2xl shadow-black/40"
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-700/50 bg-slate-800/40 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <h3 id="add-cc-bank-title" className="truncate text-base font-semibold text-white">
                    Agregar banco
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Vencimiento del resumen. El día de corte lo cargás por mes al editar el banco.
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

              <form onSubmit={handleAddBank} className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
                  <div className="min-w-0">
                    <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor="add-cc-bank-name">
                      Nombre del banco
                    </label>
                    <input
                      id="add-cc-bank-name"
                      type="text"
                      value={bankInput}
                      onChange={(e) => setBankInput(e.target.value)}
                      placeholder="Ej: Galicia, Santander…"
                      className="h-11 w-full rounded-xl border border-slate-600 bg-slate-700/60 px-4 text-sm text-white placeholder-slate-500 transition focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      autoFocus
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:items-end">
                    <div className="min-w-0">
                      <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor="add-cc-due-mode">
                        Tipo de vencimiento del resumen
                      </label>
                      <select
                        id="add-cc-due-mode"
                        value={bankDueMode}
                        onChange={(e) => setBankDueMode(e.target.value as "calendar" | "business")}
                        className="h-11 w-full rounded-xl border border-slate-600 bg-slate-700/60 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="business">N-ésimo día hábil (lun–vie)</option>
                        <option value="calendar">Día fijo del calendario (1–31)</option>
                      </select>
                    </div>

                    <div className="min-w-0">
                      <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor="add-cc-due-value">
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
                          className="h-11 w-full rounded-xl border border-slate-600 bg-slate-700/60 px-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 justify-end gap-2 border-t border-slate-700/50 bg-slate-900/30 px-5 py-3 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <button
                    type="button"
                    onClick={closeAddBank}
                    disabled={savingBanks}
                    className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-700/80 hover:text-white disabled:opacity-50"
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
    {/* ── Modal confirmación eliminar banco ─────────────────────────────── */}
    {deleteBankTarget && (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        role="presentation"
      >
        <button
          type="button"
          className="absolute inset-0 min-h-[100dvh] w-full cursor-default bg-slate-950/75 backdrop-blur-md"
          aria-label="Cerrar"
          onClick={() => { if (!deleteBankConfirming) setDeleteBankTarget(null); }}
        />
        <div
          className="relative z-10 w-full max-w-md rounded-2xl border border-slate-600/70 bg-[#1e293b]/95 p-6 shadow-2xl shadow-black/50 ring-1 ring-slate-700/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15 ring-1 ring-red-500/25">
              <CreditCard className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                Eliminar banco
              </h2>
              <p className="text-xs text-slate-400">Esta acción es irreversible</p>
            </div>
          </div>

          <p className="mb-2 text-sm text-slate-200">
            ¿Eliminar el banco{" "}
            <span className="font-semibold text-white">{deleteBankTarget}</span>?
          </p>

          {deleteBankLoading ? (
            <p className="mb-4 text-xs text-slate-400">Calculando gastos asociados…</p>
          ) : deleteBankExpenseCount != null && deleteBankExpenseCount > 0 ? (
            <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 p-3">
              <p className="text-sm font-medium text-red-300">
                Se eliminarán permanentemente{" "}
                <span className="font-bold">
                  {deleteBankExpenseCount} gasto{deleteBankExpenseCount !== 1 ? "s" : ""}
                </span>{" "}
                de tarjeta registrados con este banco.
              </p>
            </div>
          ) : (
            <p className="mb-4 text-xs text-slate-400">
              No hay gastos asociados a este banco.
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              disabled={deleteBankConfirming}
              onClick={() => setDeleteBankTarget(null)}
              className="rounded-xl border border-slate-600 bg-slate-700/60 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={deleteBankConfirming || deleteBankLoading}
              onClick={confirmDeleteBank}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
            >
              {deleteBankConfirming ? "Eliminando…" : "Sí, eliminar"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
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
