"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { CampusHeatmapMap } from "@/components/heatmap/CampusHeatmapMap";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import {
  adminListComplaints,
  adminGetNotifications,
  adminMarkNotificationRead,
  adminMarkAllNotificationsRead,
  getHeatmapData,
  ComplaintListItem,
  AdminNotification,
  HeatmapZone,
  HeatmapMarker,
  statusLabel,
  statusColor,
  priorityColor,
  formatDate,
} from "@/lib/complaints";

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function priorityWeight(p: string | null): number {
  return p ? PRIORITY_WEIGHT[p] || 0 : 0;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState<HeatmapZone[]>([]);
  const [markers, setMarkers] = useState<HeatmapMarker[]>([]);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [openIssues, setOpenIssues] = useState<ComplaintListItem[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u.role !== "admin" && u.role !== "super_admin") {
          router.replace("/login");
          return;
        }
        setUser(u);

        Promise.all([
          adminListComplaints({ page: 1, per_page: 50 })
            .then((res) => {
              const open = res.items.filter(
                (c) => c.status !== "resolved" && c.status !== "closed"
              );
              open.sort(
                (a, b) =>
                  priorityWeight(b.priority) - priorityWeight(a.priority) ||
                  new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime()
              );
              setOpenIssues(open.slice(0, 6));
            })
            .catch(() => {
              throw new Error("list");
            }),
          adminGetNotifications(true)
            .then(setNotifications)
            .catch(() => {
              throw new Error("notifs");
            }),
          getHeatmapData()
            .then((data) => {
              setZones(data.zones);
              setMarkers(data.markers);
            })
            .catch((err) => setHeatmapError(err.message || "Failed to load heatmap"))
            .finally(() => setHeatmapLoading(false)),
        ]).catch(() =>
          setDataError("Some data could not be loaded. Refresh to retry.")
        );
      })
      .catch((err) => {
        if (err instanceof Error && err.message === "Unauthorized") {
          clearToken();
        }
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const handleMarkRead = async (id: string) => {
    try {
      await adminMarkNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch {
      /* non-critical */
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await adminMarkAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      /* non-critical */
    }
  };

  const handleMarkerClick = useCallback(
    (marker: HeatmapMarker) => {
      if (marker.markerType === "complaint" && marker.complaintId) {
        router.push(`/admin/complaints/${marker.complaintId}`);
      } else if (
        marker.markerType === "duplicate_cluster" &&
        marker.complaintIds &&
        marker.complaintIds.length > 0
      ) {
        router.push(`/admin/complaints/${marker.complaintIds[0]}`);
      }
    },
    [router]
  );

  const handleZoneClick = useCallback(
    (zone: HeatmapZone) => {
      router.push(`/admin/inbox?zone=${zone.zoneId}`);
    },
    [router]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-panel-glow px-10 py-8 text-center">
          <div className="w-8 h-8 border-2 border-accent-violet/30 border-t-accent-violet rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const criticalCount = openIssues.filter((c) => c.priority === "critical").length;
  const highCount = openIssues.filter((c) => c.priority === "high").length;
  const openCount = openIssues.length;

  const actions = (
    <div className="relative">
      <button
        onClick={() => setShowNotifs(!showNotifs)}
        className="btn-secondary text-sm relative !px-3 !py-1.5"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="w-4 h-4"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-medium">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {showNotifs && (
        <div className="absolute right-0 top-11 w-80 glass-panel-glow p-4 z-50 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-accent-purple hover:text-accent-violet transition-colors"
                >
                  Mark all read
                </button>
              )}
              <span className="text-[10px] text-gray-500">
                {unreadCount} unread
              </span>
            </div>
          </div>
          {notifications.length === 0 ? (
            <p className="text-gray-500 text-sm">No notifications.</p>
          ) : (
            <div className="space-y-1.5">
              {notifications.slice(0, 10).map((n) => (
                <div
                  key={n.id}
                  className={`p-2.5 rounded-lg text-sm transition-colors ${
                    n.is_read
                      ? "text-gray-400"
                      : "text-white bg-accent-violet/8 border-l-2 border-accent-violet/50"
                  }`}
                >
                  <p className="text-xs">{n.message}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] text-gray-500">
                      {formatDate(n.created_at)}
                    </p>
                    {!n.is_read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkRead(n.id);
                        }}
                        className="text-[10px] text-accent-purple hover:text-accent-violet transition-colors"
                      >
                        Read
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <AppShell
      user={user}
      role="admin"
      title="Operations Dashboard"
      subtitle="Department complaint management"
      actions={actions}
    >
      {dataError && (
        <div className="mb-6 bg-yellow-500/8 border border-yellow-500/20 rounded-lg px-4 py-2.5 text-yellow-400 text-sm">
          {dataError}
        </div>
      )}

      {/* Minimal operational stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 stagger-children">
        <div className="stat-card">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">
            Open Issues
          </p>
          <p className="text-3xl font-bold mt-1">{openCount}</p>
        </div>
        <div className="stat-card">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">
            Critical
          </p>
          <p className="text-3xl font-bold mt-1 text-urgency-critical">
            {criticalCount}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">
            High Priority
          </p>
          <p className="text-3xl font-bold mt-1 text-urgency-high">
            {highCount}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">
            Heatmap Zones
          </p>
          <p className="text-3xl font-bold mt-1 text-accent-cyan">
            {zones.length}
          </p>
        </div>
      </div>

      {/* Heatmap hero */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span className="text-accent-cyan">&#9672;</span> Campus Heatmap
          </h2>
          <Link
            href="/admin/heatmap"
            className="text-sm text-accent-purple hover:text-accent-violet transition-colors"
          >
            Full heatmap &rarr;
          </Link>
        </div>
        <div className="glass-panel-glow p-4">
          {heatmapLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-accent-violet/30 border-t-accent-violet rounded-full animate-spin" />
            </div>
          ) : heatmapError ? (
            <div className="text-center py-12">
              <p className="text-red-400 text-sm mb-3">{heatmapError}</p>
              <button
                onClick={() => window.location.reload()}
                className="btn-secondary text-sm"
              >
                Retry
              </button>
            </div>
          ) : (
            <CampusHeatmapMap
              zones={zones}
              markers={markers}
              onZoneClick={handleZoneClick}
              onMarkerClick={handleMarkerClick}
            />
          )}
        </div>
      </div>

      {/* Priority queue */}
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Priority Queue</h2>
          {openIssues.length > 0 && (
            <Link
              href="/admin/inbox"
              className="text-accent-purple hover:text-accent-violet text-sm transition-colors"
            >
              View inbox &rarr;
            </Link>
          )}
        </div>
        {openIssues.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No open complaints in queue.
          </p>
        ) : (
          <div className="space-y-2">
            {openIssues.map((c) => (
              <Link
                key={c.id}
                href={`/admin/complaints/${c.id}`}
                className={`flex items-center justify-between glass-panel-light p-3 hover:bg-glass-light transition-all duration-200 group ${
                  c.priority === "critical"
                    ? "border-l-2 border-urgency-critical"
                    : c.priority === "high"
                    ? "border-l-2 border-urgency-high"
                    : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-accent-purple transition-colors">
                    {c.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {c.category_name || "Uncategorized"} &bull;{" "}
                    {c.department_name || "Unassigned"} &bull;{" "}
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
                      ? c.priority.charAt(0).toUpperCase() +
                        c.priority.slice(1)
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
