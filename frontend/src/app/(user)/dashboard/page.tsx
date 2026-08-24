"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u.role !== "user") {
          router.replace("/login");
          return;
        }
        setUser(u);
        // Fetch stats and recent complaints in parallel
        Promise.all([
          getComplaintStats().then(setStats).catch(() => {}),
          listComplaints({ page: 1, per_page: 5 })
            .then((res) => setRecent(res.items))
            .catch(() => {}),
        ]);
      })
      .catch(() => {
        clearToken();
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-panel px-8 py-6">
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">My Dashboard</h1>
          <p className="text-gray-400 text-sm">
            Welcome back, {user?.name?.split(" ")[0]}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{user?.name}</span>
          <button onClick={handleLogout} className="btn-secondary text-sm">
            Logout
          </button>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="glass-panel p-5">
          <p className="text-gray-400 text-sm">My Complaints</p>
          <p className="text-3xl font-bold mt-1">{stats?.total ?? 0}</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-gray-400 text-sm">Open</p>
          <p className="text-3xl font-bold mt-1 text-yellow-400">
            {stats?.open ?? 0}
          </p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-gray-400 text-sm">Resolved</p>
          <p className="text-3xl font-bold mt-1 text-green-400">
            {stats?.resolved ?? 0}
          </p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-gray-400 text-sm">High Priority</p>
          <p className="text-3xl font-bold mt-1 text-orange-400">
            {stats?.high_priority ?? 0}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="glass-panel p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Quick Actions</h2>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/new-complaint" className="btn-primary">
            New Complaint
          </Link>
          <Link href="/dashboard/complaints" className="btn-secondary">
            My Complaints
          </Link>
        </div>
      </div>

      {/* Recent Complaints */}
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Complaints</h2>
          {stats && stats.total > 5 && (
            <Link
              href="/dashboard/complaints"
              className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
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
                className="flex items-center justify-between glass-panel-light p-3 hover:bg-glass-light transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {c.category_name || "Uncategorized"} &bull;{" "}
                    {formatDate(c.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                  <span
                    className={`text-xs font-medium ${priorityColor(c.priority)}`}
                  >
                    {c.priority
                      ? c.priority.charAt(0).toUpperCase() +
                        c.priority.slice(1)
                      : "—"}
                  </span>
                  <span
                    className={`text-xs font-medium ${statusColor(c.status)}`}
                  >
                    {statusLabel(c.status)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
