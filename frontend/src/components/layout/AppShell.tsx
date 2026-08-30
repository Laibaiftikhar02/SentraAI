"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { clearToken, User } from "@/lib/auth";

interface NavLink {
  href: string;
  label: string;
}

const ROLE_NAV: Record<string, NavLink[]> = {
  user: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/new-complaint", label: "New Complaint" },
    { href: "/dashboard/complaints", label: "My Complaints" },
    { href: "/dashboard/ai-chatbot", label: "AI Assistant" },
  ],
  admin: [
    { href: "/admin/dashboard", label: "Dashboard" },
    { href: "/admin/inbox", label: "Inbox" },
    { href: "/admin/heatmap", label: "Heatmap" },
    { href: "/admin/analytics", label: "Analytics" },
  ],
  super_admin: [
    { href: "/super-admin", label: "Dashboard" },
    { href: "/super-admin/departments", label: "Departments" },
    { href: "/super-admin/categories", label: "Categories" },
    { href: "/super-admin/admins", label: "Admins" },
    { href: "/super-admin/zones", label: "Zones" },
    { href: "/super-admin/settings", label: "Settings" },
  ],
};

interface AppShellProps {
  user: User | null;
  role: "user" | "admin" | "super_admin";
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function AppShell({
  user,
  role,
  children,
  title,
  subtitle,
  actions,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

  const nav = ROLE_NAV[role] || [];

  return (
    <div className="min-h-screen flex flex-col animate-fade-in">
      {/* Top navigation shell */}
      <header className="sticky top-0 z-40 border-b border-glass-border bg-navy-900/80 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 overflow-hidden">
            <Link
              href={nav[0]?.href || "/"}
              className="font-bold text-lg tracking-tight text-white flex items-center gap-2 shrink-0"
            >
              <span className="w-2 h-2 rounded-full bg-accent-violet animate-glow-pulse" />
              SentraAI
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {nav.map((link) => {
                const active =
                  pathname === link.href || pathname.startsWith(`${link.href}/`);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
                      active
                        ? "bg-accent-violet/15 text-accent-purple"
                        : "text-gray-400 hover:text-white hover:bg-glass-light"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-gray-400 text-sm hidden lg:inline">
              {user?.name}
            </span>
            <button
              onClick={handleLogout}
              className="btn-secondary text-sm !px-3 !py-1.5"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Page content with consistent max-width */}
      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-[1600px] mx-auto">
          {(title || subtitle || actions) && (
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
              <div>
                {title && (
                  <h1 className="text-2xl font-bold flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-accent-violet animate-glow-pulse" />
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="text-gray-400 text-sm mt-0.5">{subtitle}</p>
                )}
              </div>
              {actions && (
                <div className="flex items-center gap-3">{actions}</div>
              )}
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
