"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import {
  getComplaintStats,
  adminListComplaints,
  adminGetNotifications,
  ComplaintListItem,
  ComplaintStats,
  AdminNotification,
  statusLabel,
  statusColor,
  priorityColor,
  formatDate,
} from "@/lib/complaints";

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ComplaintStats | null>(null);
  const [recent, setRecent] = useState<ComplaintListItem[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u.role !== "admin" && u.role !== "super_admin") {
          router.replace("/login");
          return;
        }
        setUser(u);
        Promise.all([
          getComplaintStats().then(setStats).catch(() => {}),
          adminListComplaints({ page: 1, per_page: 5, priority: "high" })
            .then((res) => setRecent(res.items))
            .catch(() => {}),
          adminGetNotifications(true)
            .then(setNotifications)
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

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen p-6">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-gray-400 text-sm">
            Department complaint management
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Notifications bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifs(!showNotifs)}
              className="btn-secondary text-sm relative px-3"
            >
              &#128276;
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            {showNotifs && (
              <div className="absolute right-0 top-12 w-80 glass-panel p-4 z-50 max-h-96 overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Notifications</h3>
                  <span className="text-xs text-gray-500">
                    {unreadCount} unread
                  </span>
                </div>
                {notifications.length === 0 ? (
                  <p className="text-gray-500 text-sm">No notifications.</p>
                ) : (
                  <div className="space-y-2">
                    {notifications.slice(0, 10).map((n) => (
                      <div
                        key={n.id}
                        className={`p-2 rounded-lg text-sm ${
                          n.is_read
                            ? "text-gray-400"
                            : "text-white bg-blue-500/10"
                        }`}
                      >
                        <p className="text-xs">{n.message}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatDate(n.created_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <span className="text-gray-400 text-sm">{user?.name}</span>
          <button onClick={handleLogout} className="btn-secondary text-sm">
            Logout
          </button>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="glass-panel p-5">
          <p className="text-gray-400 text-sm">Total Complaints</p>
          <p className="text-3xl font-bold mt-1">{stats?.total ?? 0}</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-gray-400 text-sm">High Priority</p>
          <p className="text-3xl font-bold mt-1 text-orange-400">
            {stats?.high_priority ?? 0}
          </p>
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
      </div>

      {/* Quick Actions */}
      <div className="glass-panel p-6 mb-6">
        <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
        <div className="flex gap-3">
          <Link href="/admin/inbox" className="btn-primary">
            Complaint Inbox
          </Link>
        </div>
      </div>

      {/* Recent High-Priority & Heatmap placeholder */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-panel p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">High Priority Queue</h2>
            {recent.length > 0 && (
              <Link
                href="/admin/inbox?priority=high"
                className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
              >
                View all &rarr;
              </Link>
            )}
          </div>
          {recent.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No high-priority complaints in queue.
            </p>
          ) : (
            <div className="space-y-2">
              {recent.map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/complaints/${c.id}`}
                  className="flex items-center justify-between glass-panel-light p-3 hover:bg-glass-light transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {c.category_name || "Uncategorized"} &bull;{" "}
                      {c.department_name || "Unassigned"} &bull;{" "}
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
                        : "\u2014"}
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
        <div className="glass-panel p-6">
          <h2 className="text-lg font-semibold mb-3">Campus Heatmap</h2>
          <p className="text-gray-500 text-sm">
            Heatmap visualization will appear in Phase 5.
          </p>
        </div>
      </div>
    </div>
  );
}
