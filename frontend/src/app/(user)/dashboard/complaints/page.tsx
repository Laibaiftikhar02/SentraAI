"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import {
  listComplaints,
  ComplaintListItem,
  statusLabel,
  statusColor,
  priorityColor,
  formatDate,
} from "@/lib/complaints";

export default function ComplaintsListPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [complaints, setComplaints] = useState<ComplaintListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fetching, setFetching] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u.role !== "user") {
          router.replace("/login");
          return;
        }
        setUser(u);
      })
      .catch((err) => {
        if (err instanceof Error && err.message === "Unauthorized") {
          clearToken();
        }
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    setFetching(true);
    setListError(null);
    listComplaints({ page, per_page: 20 })
      .then((res) => {
        setComplaints(res.items);
        setTotal(res.total);
      })
      .catch((err) =>
        setListError(err instanceof Error ? err.message : "Failed to load complaints")
      )
      .finally(() => setFetching(false));
  }, [user, page]);

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

  return (
    <AppShell
      user={user}
      role="user"
      title="My Complaints"
      subtitle={`${total} complaint${total !== 1 ? "s" : ""} submitted`}
      actions={
        <Link href="/dashboard/new-complaint" className="btn-primary text-sm">
          New Complaint
        </Link>
      }
    >
      {listError ? (
        <div className="glass-panel p-8 text-center">
          <p className="text-red-400 mb-4">{listError}</p>
          <button
            onClick={() => setPage(page)}
            className="btn-secondary text-sm"
          >
            Retry
          </button>
        </div>
      ) : complaints.length === 0 ? (
        <div className="glass-panel p-8 text-center">
          <p className="text-gray-400 mb-4">
            No complaints found. Submit your first complaint to get started.
          </p>
          <Link href="/dashboard/new-complaint" className="btn-primary">
            New Complaint
          </Link>
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-glass-border">
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">
                  Title
                </th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">
                  Category
                </th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">
                  Status
                </th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">
                  Priority
                </th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">
                  Created
                </th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">
                  Files
                </th>
                <th className="text-left text-sm font-medium text-gray-400 px-4 py-3">
                  AI
                </th>
              </tr>
            </thead>
            <tbody>
              {complaints.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-glass-border/50 hover:bg-glass-light/30 transition-colors cursor-pointer"
                  onClick={() => router.push(`/dashboard/complaints/${c.id}`)}
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-white">{c.title}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-sm">
                    {c.category_name || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-sm font-medium ${statusColor(c.status)}`}
                    >
                      {statusLabel(c.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-sm font-medium ${priorityColor(
                        c.priority
                      )}`}
                    >
                      {c.priority
                        ? c.priority.charAt(0).toUpperCase() +
                          c.priority.slice(1)
                        : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-sm">
                    {formatDate(c.created_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-sm">
                    {c.attachment_count > 0 ? `${c.attachment_count}` : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {c.ai_status === "completed" ? (
                      <span className="text-green-400 text-xs">&#10003;</span>
                    ) : c.ai_status === "pending" ? (
                      <span className="text-yellow-400 text-xs">&#8987;</span>
                    ) : c.ai_status === "unavailable" ? (
                      <span className="text-red-400 text-xs">&#10007;</span>
                    ) : (
                      <span className="text-gray-600 text-xs">{"\u2014"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

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
    </AppShell>
  );
}
