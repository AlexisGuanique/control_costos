"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Sparkles, X, Minimize2 } from "lucide-react";
import { createExpenseFromAI, createTripExpenseFromAI } from "@/lib/api";
import type { Expense, TripExpense } from "@/lib/types";

interface Message {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  expense?: Expense;
  tripExpense?: TripExpense;
}

const SUGGESTIONS_PERSONAL = [
  "Gasté 15 lucas en el supermercado",
  "Pagué Netflix por 10 dólares",
  "Uber al trabajo, 2500 pesos",
  "Compré remedios, 8 lucas",
];

const SUGGESTIONS_TRIP = [
  "Pagué yo 50 lucas en pizza",
  "María pagó 2000 pesos de bondi",
  "Lo pagó Juan, 15 dólares en souvenir",
];

interface Props {
  /** "trip" usa el endpoint de gastos del viaje (quién pagó + monto en lenguaje natural). */
  variant?: "personal" | "trip";
  tripId?: number;
  tripCurrency?: string;
  onExpenseCreated: (expense: Expense | TripExpense) => void;
}

export default function AIChatWidget({
  variant = "personal",
  tripId,
  tripCurrency = "ARS",
  onExpenseCreated,
}: Props) {
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      content:
        variant === "trip"
          ? `Podés cargar gastos del viaje en lenguaje natural. Decí quién pagó y el monto. Ejemplos: *"Pagué yo 50 lucas en pizza"* o *"Lo pagó María, 2000 pesos de taxi"*. Moneda del viaje: ${tripCurrency}.`
          : "¡Hola! Soy tu asistente financiero. Podés decirme tus gastos en lenguaje natural y los registro automáticamente. Por ejemplo: *\"Gasté 15 lucas en el super\"* o *\"Pagué Netflix por 10 dólares\"*.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      if (variant === "trip") {
        if (tripId == null) {
          throw new Error("Configuración del viaje incompleta.");
        }
        const tripExpense = await createTripExpenseFromAI(tripId, content);
        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `✅ Gasto del viaje registrado. Pagó: ${tripExpense.paid_by_name}.`,
          tripExpense,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        onExpenseCreated(tripExpense);
      } else {
        const expense = await createExpenseFromAI(content);
        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `✅ Gasto registrado exitosamente.`,
          expense,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        onExpenseCreated(expense);
      }
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "error",
          content:
            err instanceof Error
              ? err.message
              : "No pude procesar el gasto. Intentá de nuevo.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 z-50 group"
          title={variant === "trip" ? "Gastos del viaje con IA" : "Abrir asistente IA"}
        >
          <Sparkles className="w-6 h-6" />
          <span className="absolute right-16 bg-slate-800 text-white text-sm px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition border border-slate-600 shadow-lg">
            {variant === "trip" ? "IA viaje" : "Asistente IA"}
          </span>
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 max-h-[600px] flex flex-col bg-[#1e293b] border border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-2xl">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">
                  {variant === "trip" ? "IA · Gastos del viaje" : "Asistente FinTrack"}
                </p>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                  <span className="text-blue-200 text-xs">Gemini AI</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-blue-200 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 max-h-80">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} variant={variant} />
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {(variant === "trip" ? SUGGESTIONS_TRIP : SUGGESTIONS_PERSONAL).map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-600 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-slate-700 bg-slate-800/50">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  variant === "trip"
                    ? "Ej: Pagué yo 50 lucas en pizza..."
                    : "Ej: Gasté 15 lucas en el super..."
                }
                disabled={loading}
                className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="w-9 h-9 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function ChatBubble({
  message,
  variant,
}: {
  message: Message;
  variant: "personal" | "trip";
}) {
  const isUser = message.role === "user";
  const isError = message.role === "error";

  return (
    <div className={`flex items-start gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs ${
          isUser ? "bg-blue-500" : isError ? "bg-red-500/20" : "bg-blue-500/20"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-blue-400" />
        )}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
          isUser
            ? "bg-blue-600 text-white rounded-tr-sm"
            : isError
            ? "bg-red-500/10 text-red-400 border border-red-500/20 rounded-tl-sm"
            : "bg-slate-700/60 text-slate-200 rounded-tl-sm"
        }`}
      >
        <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
        {message.tripExpense && variant === "trip" && (
          <div className="mt-2 bg-slate-800/60 rounded-xl p-2.5 border border-slate-600 space-y-1">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
              Gasto del viaje
            </p>
            <p className="font-medium text-white">{message.tripExpense.description}</p>
            <p className="text-xs text-slate-500">
              Pagó: <span className="text-slate-300">{message.tripExpense.paid_by_name}</span>
            </p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">{message.tripExpense.category}</span>
              <span className="text-emerald-400 font-semibold">
                {message.tripExpense.original_amount.toLocaleString("es-AR", {
                  maximumFractionDigits: 0,
                })}{" "}
                {message.tripExpense.original_currency}
                {message.tripExpense.original_currency !== "ARS" && (
                  <span className="text-slate-500 font-normal ml-1">
                    →{" "}
                    {message.tripExpense.base_amount.toLocaleString("es-AR", {
                      style: "currency",
                      currency: "ARS",
                    })}
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
        {message.expense && (
          <div className="mt-2 bg-slate-800/60 rounded-xl p-2.5 border border-slate-600 space-y-1">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
              Gasto registrado
            </p>
            <p className="font-medium text-white">{message.expense.description}</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">{message.expense.category}</span>
              <span className="text-emerald-400 font-semibold">
                {message.expense.original_currency !== "ARS"
                  ? `${message.expense.original_amount} ${message.expense.original_currency} → `
                  : ""}
                {message.expense.base_amount.toLocaleString("es-AR", {
                  style: "currency",
                  currency: "ARS",
                })}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
