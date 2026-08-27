"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import {
  getAnalyticsComplaints,
  getAnalyticsUrgency,
  getAnalyticsCategories,
  getAnalyticsLocations,
  getAnalyticsDuplicates,
  getAnalyticsDepartments,
  ComplaintVolume,
  UrgencyDistribution,
  CategoryDistributionItem,
  LocationStatsItem,
  DuplicateStatsItem,
  DepartmentPerformanceItem,
} from "@/lib/complaints";

// ── Bar Chart Component (pure CSS) ──────────────────────────────────────────

function HorizontalBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-400 w-24 truncate text-right">
        {label}
      </span>
      <div className="flex-1 bg-navy-700 rounded-full h-6 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.max(pct, value > 0 ? 4 : 0)}%` }}
        />
      </div>
      <span className="text-sm font-medium w-10 text-right">{value}</span>
    </div>
  );
}

// ── Skeleton Loader ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="glass-panel p-5 animate-pulse">
      <div className="h-4 bg-white/5 rounded w-24 mb-3" />
      <div className="h-8 bg-white/5 rounded w-16" />
    </div>
  );
}

function SkeletonPanel() {
  return (
    <div className="glass-panel p-6 animate-pulse">
      <div className="h-5 bg-white/5 rounded w-40 mb-4" />
      <div className="space-y-3">
        <div className="h-6 bg-white/5 rounded" />
        <div className="h-6 bg-white/5 rounded" />
        <div className="h-6 bg-white/5 rounded" />
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [volume, setVolume] = useState<ComplaintVolume | null>(null);
  const [urgency, setUrgency] = useState<UrgencyDistribution | null>(null);
  const [categories, setCategories] = useState<CategoryDistributionItem[]>([]);
  const [locations, setLocations] = useState<LocationStatsItem[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateStatsItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentPerformanceItem[]>(
    []
  );

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u.role !== "admin" && u.role !== "super_admin") {
          router.replace("/login");
          return;
        }
        setUser(u);
        // Fetch all analytics in parallel
        Promise.allSettled([
          getAnalyticsComplaints().then(setVolume),
          getAnalyticsUrgency().then(setUrgency),
          getAnalyticsCategories().then(setCategories),
          getAnalyticsLocations().then(setLocations),
          getAnalyticsDuplicates().then(setDuplicates),
          getAnalyticsDepartments().then(setDepartments),
        ]).then((results) => {
          const failed = results.filter((r) => r.status === "rejected");
          if (failed.length === results.length) {
            setError("Failed to load analytics data. Please try again.");
          }
        });
      })
      .catch((err) => {
        if (err instanceof Error && err.message === "Unauthorized") {
          clearToken();
        }
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

  // ── Loading State ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen p-6">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Analytics</h1>
            <p className="text-gray-400 text-sm">Loading dashboard data...</p>
          </div>
          <Link href="/admin/dashboard" className="btn-secondary text-sm">
            Back to Dashboard
          </Link>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <SkeletonPanel />
          <SkeletonPanel />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonPanel />
          <SkeletonPanel />
        </div>
      </div>
    );
  }

  // ── Error State ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="min-h-screen p-6">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Analytics</h1>
            <p className="text-gray-400 text-sm">Dashboard</p>
          </div>
          <Link href="/admin/dashboard" className="btn-secondary text-sm">
            Back to Dashboard
          </Link>
        </header>
        <div className="glass-panel p-8 text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Empty State ────────────────────────────────────────────────────────────

  const hasData = (volume?.total ?? 0) > 0;

  // Urgency bar max for scaling
  const urgencyMax = urgency
    ? Math.max(
        urgency.critical,
        urgency.high,
        urgency.medium,
        urgency.low,
        1
      )
    : 1;

  // Category bar max for scaling
  const categoryMax =
    categories.length > 0
      ? Math.max(...categories.map((c) => c.count), 1)
      : 1;

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-gray-400 text-sm">
            Complaint analytics and insights
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin/dashboard" className="btn-secondary text-sm">
            Back to Dashboard
          </Link>
          <button onClick={handleLogout} className="btn-secondary text-sm">
            Logout
          </button>
        </div>
      </header>

      {/* Empty state */}
      {!hasData && (
        <div className="glass-panel p-8 text-center mb-8">
          <p className="text-gray-400 text-lg mb-2">No complaints yet</p>
          <p className="text-gray-500 text-sm">
            Analytics will appear once complaints are submitted and processed.
          </p>
        </div>
      )}

      {/* ── Volume Stat Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="glass-panel p-5">
          <p className="text-gray-400 text-sm">Total Complaints</p>
          <p className="text-3xl font-bold mt-1">{volume?.total ?? 0}</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-gray-400 text-sm">Pending</p>
          <p className="text-3xl font-bold mt-1 text-yellow-400">
            {volume?.pending ?? 0}
          </p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-gray-400 text-sm">Resolved</p>
          <p className="text-3xl font-bold mt-1 text-green-400">
            {volume?.resolved ?? 0}
          </p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-gray-400 text-sm">Resolution Rate</p>
          <p className="text-3xl font-bold mt-1 text-blue-400">
            {volume?.resolution_rate ?? 0}%
          </p>
        </div>
      </div>

      {/* ── Urgency & Category Distribution ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* Urgency Distribution */}
        <div className="glass-panel p-6">
          <h2 className="text-lg font-semibold mb-4">Urgency Distribution</h2>
          {urgency && urgency.total > 0 ? (
            <div className="space-y-3">
              <HorizontalBar
                label="Critical"
                value={urgency.critical}
                max={urgencyMax}
                color="bg-red-500"
              />
              <HorizontalBar
                label="High"
                value={urgency.high}
                max={urgencyMax}
                color="bg-orange-500"
              />
              <HorizontalBar
                label="Medium"
                value={urgency.medium}
                max={urgencyMax}
                color="bg-yellow-500"
              />
              <HorizontalBar
                label="Low"
                value={urgency.low}
                max={urgencyMax}
                color="bg-green-500"
              />
              {urgency.unassigned > 0 && (
                <HorizontalBar
                  label="Unassigned"
                  value={urgency.unassigned}
                  max={urgencyMax}
                  color="bg-gray-500"
                />
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">
              No urgency data available yet.
            </p>
          )}
        </div>

        {/* Category Distribution */}
        <div className="glass-panel p-6">
          <h2 className="text-lg font-semibold mb-4">
            Category Distribution
          </h2>
          {categories.length > 0 && categories.some((c) => c.count > 0) ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {categories
                .filter((c) => c.count > 0)
                .map((cat) => (
                  <HorizontalBar
                    key={cat.category_name}
                    label={cat.category_name}
                    value={cat.count}
                    max={categoryMax}
                    color="bg-blue-500"
                  />
                ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">
              No category data available yet.
            </p>
          )}
        </div>
      </div>

      {/* ── Locations & Duplicates ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* Top Campus Zones */}
        <div className="glass-panel p-6">
          <h2 className="text-lg font-semibold mb-4">Top Campus Zones</h2>
          {locations.length > 0 && locations.some((l) => l.total_reports > 0) ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-glass-border">
                    <th className="text-left py-2 pr-4">Zone</th>
                    <th className="text-right py-2 px-2">Reports</th>
                    <th className="text-right py-2 px-2">Critical</th>
                    <th className="text-right py-2 px-2">High</th>
                    <th className="text-right py-2 pl-2">Medium</th>
                  </tr>
                </thead>
                <tbody>
                  {locations
                    .filter((l) => l.total_reports > 0)
                    .slice(0, 10)
                    .map((loc) => (
                      <tr
                        key={loc.zone_name}
                        className="border-b border-glass-border/50"
                      >
                        <td className="py-2 pr-4">
                          <span className="text-white">{loc.zone_name}</span>
                          {loc.zone_type && (
                            <span className="text-gray-500 text-xs ml-2">
                              ({loc.zone_type})
                            </span>
                          )}
                        </td>
                        <td className="text-right py-2 px-2 font-medium">
                          {loc.total_reports}
                        </td>
                        <td className="text-right py-2 px-2 text-red-400">
                          {loc.critical > 0 ? loc.critical : "\u2014"}
                        </td>
                        <td className="text-right py-2 px-2 text-orange-400">
                          {loc.high > 0 ? loc.high : "\u2014"}
                        </td>
                        <td className="text-right py-2 pl-2 text-yellow-400">
                          {loc.medium > 0 ? loc.medium : "\u2014"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">
              No zone data available yet.
            </p>
          )}
        </div>

        {/* Top Duplicate Clusters */}
        <div className="glass-panel p-6">
          <h2 className="text-lg font-semibold mb-4">
            Top Duplicate Clusters
          </h2>
          {duplicates.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {duplicates.map((d) => (
                <div
                  key={d.cluster_id}
                  className="glass-panel-light p-3 flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      {d.summary || "Untitled cluster"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {d.member_count} report
                      {d.member_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {d.highest_priority && (
                    <span
                      className={`text-xs font-medium ml-3 shrink-0 ${
                        d.highest_priority === "critical"
                          ? "text-red-400"
                          : d.highest_priority === "high"
                            ? "text-orange-400"
                            : d.highest_priority === "medium"
                              ? "text-yellow-400"
                              : "text-green-400"
                      }`}
                    >
                      {d.highest_priority.charAt(0).toUpperCase() +
                        d.highest_priority.slice(1)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">
              No duplicate clusters detected yet.
            </p>
          )}
        </div>
      </div>

      {/* ── Department Performance ──────────────────────────────────────── */}
      <div className="glass-panel p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Department Performance</h2>
        {departments.length > 0 && departments.some((d) => d.total > 0) ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-glass-border">
                  <th className="text-left py-2 pr-4">Department</th>
                  <th className="text-right py-2 px-4">Total</th>
                  <th className="text-right py-2 px-4">Resolved</th>
                  <th className="text-right py-2 px-4">Open</th>
                  <th className="text-right py-2 pl-4">Resolution Rate</th>
                </tr>
              </thead>
              <tbody>
                {departments
                  .filter((d) => d.total > 0)
                  .map((dept) => (
                    <tr
                      key={dept.department_name}
                      className="border-b border-glass-border/50"
                    >
                      <td className="py-2 pr-4 font-medium">
                        {dept.department_name}
                      </td>
                      <td className="text-right py-2 px-4">{dept.total}</td>
                      <td className="text-right py-2 px-4 text-green-400">
                        {dept.resolved}
                      </td>
                      <td className="text-right py-2 px-4 text-yellow-400">
                        {dept.open}
                      </td>
                      <td className="text-right py-2 pl-4">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 bg-navy-700 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{
                                width: `${dept.resolution_rate}%`,
                              }}
                            />
                          </div>
                          <span className="text-blue-400 font-medium w-12 text-right">
                            {dept.resolution_rate}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">
            No department data available yet.
          </p>
        )}
      </div>
    </div>
  );
}
