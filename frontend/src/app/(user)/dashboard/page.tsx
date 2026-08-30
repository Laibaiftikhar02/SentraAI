"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import {
  getComplaintStats,
  listComplaints,
  ComplaintListItem,
  ComplaintStats,
  statusLabel,
  statusColor,
  priorityColor,
  formatDate,
} from "@/lib/complaints";

export default function UserDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ComplaintStats | null>(null);
  const [recent, setRecent] = useState<ComplaintListItem[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u.role !== "user") {
          router.replace("/login");
          return;
        }
        setUser(u);
        Promise.all([
          getComplaintStats().then(setStats).catch(() => {
            throw new Error("stats");
          }),
          listComplaints({ page: 1, per_page: 5 })
            .then((res) => setRecent(res.items))
            .catch(() => {
              throw new Error("list");
            }),
        ]).catch(() =>
          setDataError("Some data could not be loaded. Refresh to retry.")
        );
      })
      .catch((err) => {
        if (err instanceof Error && err.message === "Unauthorized")
          clearToken();
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-panel-glow px-10 py-8 text-center">
          <div className="w-8 h-8 border-2 border-accent-violet/30 border-t-accent-violet rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      user={user}
      role="user"
      title="My Dashboard"
      subtitle={`Welcome back, ${user?.name?.split(" ")[0]}`}
    >
      {dataError && (
        <div className="mb-6 bg-yellow-500/8 border border-yellow-500/20 rounded-lg px-4 py-2.5 text-yellow-400 text-sm">
          {dataError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 stagger-children">
        <div className="stat-card">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">
            My Complaints
          </p>
          <p className="text-3xl font-bold mt-1">{stats?.total ?? 0}</p>
        </div>
        <div className="stat-card">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">
            Open
          </p>
          <p className="text-3xl font-bold mt-1 text-yellow-400">
            {stats?.open ?? 0}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">
            Resolved
          </p>
          <p className="text-3xl font-bold mt-1 text-green-400">
            {stats?.resolved ?? 0}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">
            High Priority
          </p>
          <p className="text-3xl font-bold mt-1 text-orange-400">
            {stats?.high_priority ?? 0}
          </p>
        </div>
      </div>

      {/* AI Assistant entry point */}
      <Link
        href="/dashboard/ai-chatbot"
        className="glass-panel-glow p-5 mb-6 group block hover:border-accent-violet/20 transition-all duration-300"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent-violet/15 flex items-center justify-center group-hover:bg-accent-violet/25 transition-colors">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="w-6 h-6 text-accent-purple"
              >
                <path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold group-hover:text-accent-purple transition-colors">
                Report with AI Assistant
              </h2>
              <p className="text-gray-500 text-sm">
                Describe your issue in natural conversation and let SentraAI
                classify and route it.
              </p>
            </div>
          </div>
          <span className="text-accent-purple group-hover:translate-x-1 transition-transform duration-200">
            &rarr;
          </span>
        </div>
      </Link>

      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Recent Complaints</h2>
          {stats && stats.total > 5 && (
            <Link
              href="/dashboard/complaints"
              className="text-accent-purple hover:text-accent-violet text-sm transition-colors"
            >
              View all &rarr;
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No complaints yet. Submit your first complaint to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {recent.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/complaints/${c.id}`}
                className="flex items-center justify-between glass-panel-light p-3 hover:bg-glass-light hover:border-accent-violet/15 transition-all duration-200 group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-accent-purple transition-colors">
                    {c.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {c.category_name || "Uncategorized"} &bull;{" "}
                    {formatDate(c.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2.5 ml-4 shrink-0">
                  <span
                    className={
                      priorityColor(c.priority) + " text-xs font-medium"
                    }
                  >
                    {c.priority
                      ? c.priority.charAt(0).toUpperCase() + c.priority.slice(1)
                      : "\u2014"}
                  </span>
                  <span className={statusColor(c.status) + " text-xs font-medium"}>
                    {statusLabel(c.status)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
