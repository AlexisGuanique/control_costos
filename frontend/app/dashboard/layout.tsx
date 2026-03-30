"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, TrendingUp } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { UserProvider, useUser } from "@/lib/UserContext";
import { getMe } from "@/lib/api";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, setUser } = useUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("fintrack_token");
    if (!token) {
      router.push("/");
      return;
    }
    getMe()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("fintrack_token");
        router.push("/");
      });
  }, [router, setUser]);

  /** Una sola columna de scroll: el <main>. Evita doble barra (body + main) en móvil. */
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  function handleLogout() {
    localStorage.removeItem("fintrack_token");
    router.push("/");
  }

  return (
    <div className="fixed inset-0 z-[1] flex min-h-0 overflow-hidden bg-[#0f172a]">
      {/* Sidebar — fixed overlay on mobile, flex child on desktop */}
      <Sidebar
        user={user}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* Content area — always full width on mobile, flex-1 on desktop */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 shrink-0 bg-[#1e293b]/90 backdrop-blur-lg border-b border-slate-700/60">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-base">FinTrack AI</span>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserProvider>
      <DashboardContent>{children}</DashboardContent>
    </UserProvider>
  );
}
