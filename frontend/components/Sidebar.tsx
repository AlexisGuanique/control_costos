"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  Plane,
  Settings,
  LogOut,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useState } from "react";
import type { User } from "@/lib/types";

const NAV_ITEMS = [
  { label: "Dashboard",           href: "/dashboard",                icon: LayoutDashboard },
  { label: "Finanzas Personales", href: "/dashboard/finanzas",       icon: Receipt },
  { label: "Gestión de Viajes",   href: "/dashboard/viajes",         icon: Plane },
  { label: "Configuraciones",     href: "/dashboard/configuraciones", icon: Settings },
];

interface Props {
  user: User | null;
  onLogout: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ user, onLogout, mobileOpen, onMobileClose }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* ── Mobile backdrop ─────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={onMobileClose}
        />
      )}

      {/* ── Sidebar panel ───────────────────────────────────────────────── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50
          lg:relative lg:inset-auto lg:z-auto lg:flex lg:shrink-0

          flex flex-col h-full min-h-0
          bg-[#1e293b] border-r border-slate-700/60
          transition-transform duration-300 ease-in-out

          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          w-64
          ${collapsed ? "lg:w-[68px]" : "lg:w-60"}
        `}
      >
        {/* Logo */}
        <div className={`flex items-center gap-3 px-4 py-5 ${collapsed ? "lg:justify-center lg:px-0" : ""}`}>
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <span className={`text-[17px] font-bold text-white whitespace-nowrap tracking-tight ${collapsed ? "lg:hidden" : ""}`}>
            FinTrack AI
          </span>

          {/* Close button (mobile only) */}
          <button
            onClick={onMobileClose}
            className="lg:hidden ml-auto w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Desktop collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute -right-3.5 top-6 w-7 h-7 bg-slate-800 border border-slate-600 rounded-full items-center justify-center text-slate-400 hover:text-white hover:border-blue-500 transition-all z-10 shadow-md"
          title={collapsed ? "Expandir menú" : "Colapsar menú"}
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        <div className="mx-3 h-px bg-slate-700/60 mb-3" />

        {/* Navigation */}
        <nav className="flex-1 px-2.5 space-y-1">
          {!collapsed && (
            <p className="hidden lg:block text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-3 pb-1">
              Menú
            </p>
          )}
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const isActive =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                onClick={onMobileClose}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-150 group
                  ${isActive
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                    : "text-slate-400 hover:bg-slate-700/50 hover:text-slate-100"
                  }
                  ${collapsed ? "lg:justify-center" : ""}
                `}
              >
                <Icon className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-105 ${isActive ? "text-white" : ""}`} />
                <span className={`truncate leading-none ${collapsed ? "lg:hidden" : ""}`}>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User + logout */}
        <div className="p-2.5 border-t border-slate-700/60 space-y-1">
          {user && !collapsed && (
            <div className="px-3 py-2.5 rounded-xl bg-slate-700/30 border border-slate-700/50 mb-1">
              <p className="text-sm font-semibold text-white truncate leading-tight">{user.full_name}</p>
              <p className="text-xs text-slate-400 truncate mt-0.5">{user.email}</p>
              <div className="mt-1.5">
                <span className="bg-blue-500/15 text-blue-400 text-[11px] px-2 py-0.5 rounded-md font-semibold border border-blue-500/20">
                  {user.base_currency}
                </span>
              </div>
            </div>
          )}

          {user && collapsed && (
            <div
              className="hidden lg:flex items-center justify-center py-1 mb-1"
              title={`${user.full_name} · ${user.base_currency}`}
            >
              <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-400">
                {user.full_name.charAt(0).toUpperCase()}
              </div>
            </div>
          )}

          <button
            onClick={onLogout}
            title={collapsed ? "Cerrar sesión" : undefined}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
              text-slate-400 hover:bg-red-500/10 hover:text-red-400
              transition-all duration-150
              ${collapsed ? "lg:justify-center" : ""}
            `}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span className={collapsed ? "lg:hidden" : ""}>Cerrar sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
}
