"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import {
  adminListComplaints,
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

export default function AdminInboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [complaints, setComplaints] = useState<ComplaintListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fetching, setFetching] = useState(false);

  // Reference data for filter dropdowns
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") || ""
  );
  const [priorityFilter, setPriorityFilter] = useState(
    searchParams.get("priority") || ""
  );
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
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
        // Load reference data for filter dropdowns
        adminGetDepartments().then(setDepartments).catch(() => {});
        getCategories().then(setCategories).catch(() => {});
        getZones().then(setZones).catch(() => {});
      })
      .catch(() => {
        clearToken();
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const fetchComplaints = useCallback(() => {
    if (!user) return;
    setFetching(true);
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
      .catch(() => {})
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

  // Reset to page 1 when filters change
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

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="min-h-screen p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.push("/admin/dashboard")}
            className="text-gray-400 hover:text-white text-sm mb-2 transition-colors"
          >
            &larr; Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold">Complaint Inbox</h1>
          <p className="text-gray-400 text-sm">
            {total} complaint{total !== 1 ? "s" : ""} in your scope
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{user?.name}</span>
          <button onClick={handleLogout} className="btn-secondary text-sm">
            Logout
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="glass-panel p-4 mb-6">
        <form onSubmit={handleSearch} className="space-y-3">
          {/* Row 1: Search + Status + Priority */}
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

          {/* Row 2: Department + Category + Zone */}
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

          {/* Row 3: Date range + Search/Clear buttons */}
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
      {complaints.length === 0 && !fetching ? (
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
                    Department
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">
                    Zone
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">
                    AI Summary
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">
                    Assigned
                  </th>
                </tr>
              </thead>
              <tbody>
                {complaints.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-glass-border/50 hover:bg-glass-light/30 transition-colors cursor-pointer"
                    onClick={() => router.push(`/admin/complaints/${c.id}`)}
                  >
                    <td className="px-3 py-3 text-gray-500 text-xs font-mono whitespace-nowrap">
                      {c.id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-3 max-w-[200px]">
                      <span className="font-medium text-white text-sm truncate block">
                        {c.title}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`text-xs font-medium ${priorityColor(c.priority)}`}
                      >
                        {c.priority
                          ? c.priority.charAt(0).toUpperCase() +
                            c.priority.slice(1)
                          : "\u2014"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-400 text-xs">
                      {c.category_name || "\u2014"}
                    </td>
                    <td className="px-3 py-3 text-gray-400 text-xs">
                      {c.department_name || "\u2014"}
                    </td>
                    <td className="px-3 py-3 text-gray-400 text-xs">
                      {c.zone_name || "\u2014"}
                    </td>
                    <td className="px-3 py-3 max-w-[180px]">
                      {c.ai_summary ? (
                        <p className="text-xs text-gray-500 truncate">
                          {c.ai_summary}
                        </p>
                      ) : c.ai_status === "completed" ? (
                        <span className="text-green-400 text-xs">
                          &#10003; AI
                        </span>
                      ) : c.ai_status === "pending" ? (
                        <span className="text-yellow-400 text-xs">
                          &#8987;
                        </span>
                      ) : c.ai_status === "unavailable" ? (
                        <span className="text-red-400 text-xs">
                          &#10007;
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs">
                          {"\u2014"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`text-xs font-medium ${statusColor(c.status)}`}
                      >
                        {statusLabel(c.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {c.assigned_admin || "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
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
                onClick={() => setPage((p) => (p < totalPages ? p + 1 : p))}
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
    </div>
  );
}
