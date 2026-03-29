"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, register } from "@/lib/api";
import { TrendingUp, Sparkles, Globe, Shield } from "lucide-react";

type Mode = "login" | "register";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [currency, setCurrency] = useState("ARS");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        await register(email, password, fullName, currency);
      }
      const token = await login(email, password);
      localStorage.setItem("fintrack_token", token.access_token);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel – branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900 flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-white">FinTrack AI</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-5xl font-bold text-white leading-tight">
            Controla tus finanzas con{" "}
            <span className="text-blue-300">inteligencia artificial</span>
          </h1>
          <p className="text-blue-200 text-lg">
            Registra gastos en lenguaje natural, convierte monedas en tiempo
            real y visualiza tus hábitos financieros.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {[
            {
              icon: Sparkles,
              title: "IA Conversacional",
              desc: "\"Gasté 15 lucas en el super\" → registrado automáticamente",
            },
            {
              icon: Globe,
              title: "Multi-moneda",
              desc: "ARS, USD, EUR con cotización dólar blue en tiempo real",
            },
            {
              icon: Shield,
              title: "Seguro y privado",
              desc: "JWT auth, datos protegidos y persistentes",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="flex items-start gap-4 bg-white/5 rounded-xl p-4 border border-white/10"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-blue-300" />
              </div>
              <div>
                <p className="font-semibold text-white">{title}</p>
                <p className="text-blue-200 text-sm">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel – form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-[#0f172a]">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:hidden mb-8">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">FinTrack AI</span>
            </div>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-white">
              {mode === "login" ? "Bienvenido de vuelta" : "Crear cuenta"}
            </h2>
            <p className="text-slate-400 mt-2">
              {mode === "login"
                ? "Ingresa tus credenciales para continuar"
                : "Registrate gratis y empieza hoy"}
            </p>
          </div>

          {/* Toggle */}
          <div className="flex rounded-xl bg-slate-800 p-1">
            {(["login", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === m
                    ? "bg-blue-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {m === "login" ? "Iniciar sesión" : "Registrarse"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <>
                <InputField
                  label="Nombre completo"
                  type="text"
                  value={fullName}
                  onChange={setFullName}
                  placeholder="Juan García"
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Moneda base
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="ARS">🇦🇷 Peso Argentino (ARS)</option>
                    <option value="USD">🇺🇸 Dólar (USD)</option>
                    <option value="EUR">🇪🇺 Euro (EUR)</option>
                  </select>
                </div>
              </>
            )}
            <InputField
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="juan@email.com"
              required
            />
            <InputField
              label="Contraseña"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              required
            />

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Procesando...
                </>
              ) : mode === "login" ? (
                "Ingresar"
              ) : (
                "Crear cuenta"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function InputField({
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
      />
    </div>
  );
}
