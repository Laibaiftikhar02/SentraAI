"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import {
  adminListComplaints,
  adminUpdateComplaint,
  adminGetDepartments,
  getCategories,
  getZones,
  ComplaintListItem,
  DepartmentOption,
  CategoryOption,
  ZoneOption,
  statusLabel,
  statusColor,
  priorityColor,
  formatDate,
} from "@/lib/complaints";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "created", label: "Created" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "reopened", label: "Reopened" },
];

const PRIORITY_OPTIONS = [
  { value: "", label: "All Priorities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function priorityWeight(p: string | null): number {
  return p ? PRIORITY_WEIGHT[p] || 0 : 0;
}

const RESOLVABLE_STATUSES = ["assigned", "in_progress"];

export default function AdminInboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="glass-panel-glow px-10 py-8 text-center">
            <div className="w-8 h-8 border-2 border-accent-violet/30 border-t-accent-violet rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Loading inbox...</p>
          </div>
        </div>
      }
    >
      <AdminInboxContent />
    </Suspense>
  );
}

function AdminInboxContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [complaints, setComplaints] = useState<ComplaintListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fetching, setFetching] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);

  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") || ""
  );
  const [priorityFilter, setPriorityFilter] = useState(
    searchParams.get("priority") || ""
  );
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [zoneFilter, setZoneFilter] = useState(searchParams.get("zone") || "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u.role !== "admin" && u.role !== "super_admin") {
          router.replace("/login");
          return;
        }
        setUser(u);
        adminGetDepartments().then(setDepartments).catch(() => {});
        getCategories().then(setCategories).catch(() => {});
        getZones().then(setZones).catch(() => {});
      })
      .catch((err) => {
        if (err instanceof Error && err.message === "Unauthorized") {
          clearToken();
        }
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const fetchComplaints = useCallback(() => {
    if (!user) return;
    setFetching(true);
    setListError(null);
    adminListComplaints({
      page,
      per_page: 20,
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
      department: departmentFilter || undefined,
      category: categoryFilter || undefined,
      zone: zoneFilter || undefined,
      search: appliedSearch || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    })
      .then((res) => {
        setComplaints(res.items);
        setTotal(res.total);
      })
      .catch((err) =>
        setListError(
          err instanceof Error ? err.message : "Failed to load complaints"
        )
      )
      .finally(() => setFetching(false));
  }, [
    user,
    page,
    statusFilter,
    priorityFilter,
    departmentFilter,
    categoryFilter,
    zoneFilter,
    dateFrom,
    dateTo,
    appliedSearch,
  ]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  useEffect(() => {
    setPage(1);
  }, [
    statusFilter,
    priorityFilter,
    departmentFilter,
    categoryFilter,
    zoneFilter,
    dateFrom,
    dateTo,
    appliedSearch,
  ]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setAppliedSearch(searchQuery);
  }

  const hasActiveFilters =
    statusFilter ||
    priorityFilter ||
    departmentFilter ||
    categoryFilter ||
    zoneFilter ||
    dateFrom ||
    dateTo ||
    appliedSearch;

  function clearAllFilters() {
    setStatusFilter("");
    setPriorityFilter("");
    setDepartmentFilter("");
    setCategoryFilter("");
    setZoneFilter("");
    setDateFrom("");
    setDateTo("");
    setSearchQuery("");
    setAppliedSearch("");
  }

  async function handleResolve(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setResolvingId(id);
    try {
      await adminUpdateComplaint(id, { status: "resolved" });
      await fetchComplaints();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resolve complaint");
    } finally {
      setResolvingId(null);
    }
  }

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

  const totalPages = Math.ceil(total / 20);

  const sortedComplaints = [...complaints].sort(
    (a, b) =>
      priorityWeight(b.priority) - priorityWeight(a.priority) ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <AppShell
      user={user}
      role="admin"
      title="Complaint Inbox"
      subtitle={`${total} complaint${total !== 1 ? "s" : ""} in your scope`}
      actions={
        <Link href="/admin/heatmap" className="btn-secondary text-sm">
          Heatmap
        </Link>
      }
    >
      {/* Filters */}
      <div className="glass-panel p-4 mb-6">
        <form onSubmit={handleSearch} className="space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search by title or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="glass-input w-full text-sm"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="glass-input text-sm"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="glass-input text-sm"
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="glass-input text-sm"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="glass-input text-sm"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="glass-input text-sm"
            >
              <option value="">All Zones</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex items-center gap-2">
              <label className="text-gray-400 text-xs whitespace-nowrap">
                From:
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="glass-input text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-gray-400 text-xs whitespace-nowrap">
                To:
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="glass-input text-sm"
              />
            </div>
            <button type="submit" className="btn-primary text-sm">
              Search
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="btn-secondary text-sm"
              >
                Clear
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Table */}
      {listError ? (
        <div className="glass-panel p-8 text-center">
          <p className="text-red-400 mb-3">{listError}</p>
          <button onClick={fetchComplaints} className="btn-secondary text-sm">
            Retry
          </button>
        </div>
      ) : complaints.length === 0 && !fetching ? (
        <div className="glass-panel p-8 text-center">
          <p className="text-gray-400">
            No complaints found matching your filters.
          </p>
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">
                    ID
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">
                    Title
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">
                    Priority
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">
                    Category
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">
                    Dept
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">
                    Zone
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">
                    Assigned
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedComplaints.map((c) => {
                  const canResolve = RESOLVABLE_STATUSES.includes(c.status);
                  const rowAccent =
                    c.priority === "critical"
                      ? "border-l-2 border-urgency-critical bg-red-500/[0.03]"
                      : c.priority === "high"
                      ? "border-l-2 border-urgency-high bg-orange-500/[0.02]"
                      : "";
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-glass-border/50 hover:bg-glass-light/30 transition-colors ${rowAccent}`}
                    >
                      <td
                        className="px-3 py-3 text-gray-500 text-xs font-mono whitespace-nowrap cursor-pointer"
                        onClick={() => router.push(`/admin/complaints/${c.id}`)}
                      >
                        {c.id.slice(0, 8)}
                      </td>
                      <td
                        className="px-3 py-3 max-w-[200px] cursor-pointer"
                        onClick={() => router.push(`/admin/complaints/${c.id}`)}
                      >
                        <span className="font-medium text-white text-sm truncate block">
                          {c.title}
                        </span>
                        {c.ai_summary && (
                          <p className="text-xs text-gray-500 truncate">
                            {c.ai_summary}
                          </p>
                        )}
                      </td>
                      <td
                        className="px-3 py-3 cursor-pointer"
                        onClick={() => router.push(`/admin/complaints/${c.id}`)}
                      >
                        <span
                          className={`text-xs font-medium ${priorityColor(
                            c.priority
                          )}`}
                        >
                          {c.priority
                            ? c.priority.charAt(0).toUpperCase() +
                              c.priority.slice(1)
                            : "\u2014"}
                        </span>
                      </td>
                      <td
                        className="px-3 py-3 text-gray-400 text-xs cursor-pointer"
                        onClick={() => router.push(`/admin/complaints/${c.id}`)}
                      >
                        {c.category_name || "\u2014"}
                      </td>
                      <td
                        className="px-3 py-3 text-gray-400 text-xs cursor-pointer"
                        onClick={() => router.push(`/admin/complaints/${c.id}`)}
                      >
                        {c.department_name || "\u2014"}
                      </td>
                      <td
                        className="px-3 py-3 text-gray-400 text-xs cursor-pointer"
                        onClick={() => router.push(`/admin/complaints/${c.id}`)}
                      >
                        {c.zone_name || "\u2014"}
                      </td>
                      <td
                        className="px-3 py-3 cursor-pointer"
                        onClick={() => router.push(`/admin/complaints/${c.id}`)}
                      >
                        <span
                          className={`text-xs font-medium ${statusColor(
                            c.status
                          )}`}
                        >
                          {statusLabel(c.status)}
                        </span>
                      </td>
                      <td
                        className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap cursor-pointer"
                        onClick={() => router.push(`/admin/complaints/${c.id}`)}
                      >
                        {c.assigned_admin || "\u2014"}
                      </td>
                      <td className="px-3 py-3">
                        {canResolve && (
                          <button
                            onClick={(e) => handleResolve(c.id, e)}
                            disabled={resolvingId === c.id}
                            className="text-xs px-2.5 py-1 rounded-md bg-green-500/15 text-green-400 border border-green-500/20 hover:bg-green-500/25 transition-colors disabled:opacity-50"
                          >
                            {resolvingId === c.id
                              ? "Resolving..."
                              : "Resolve"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-glass-border">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-gray-400 text-sm">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() =>
                  setPage((p) => (p < totalPages ? p + 1 : p))
                }
                disabled={page >= totalPages}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {fetching && (
        <div className="text-center py-4">
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      )}
    </AppShell>
  );
}
