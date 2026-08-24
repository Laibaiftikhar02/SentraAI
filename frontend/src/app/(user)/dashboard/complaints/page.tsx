"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u.role !== "user") {
          router.replace("/login");
          return;
        }
        setUser(u);
      })
      .catch(() => {
        clearToken();
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    setFetching(true);
    listComplaints({ page, per_page: 20 })
      .then((res) => {
        setComplaints(res.items);
        setTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [user, page]);

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
          <button
            onClick={() => router.push("/dashboard")}
            className="text-gray-400 hover:text-white text-sm mb-2 transition-colors"
          >
            &larr; Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold">My Complaints</h1>
          <p className="text-gray-400 text-sm">
            {total} complaint{total !== 1 ? "s" : ""} submitted
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard/new-complaint" className="btn-primary text-sm">
            New Complaint
          </Link>
          <span className="text-gray-400 text-sm">{user?.name}</span>
          <button onClick={handleLogout} className="btn-secondary text-sm">
            Logout
          </button>
        </div>
      </header>

      {complaints.length === 0 ? (
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
              </tr>
            </thead>
            <tbody>
              {complaints.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-glass-border/50 hover:bg-glass-light/30 transition-colors cursor-pointer"
                  onClick={() =>
                    router.push(`/dashboard/complaints/${c.id}`)
                  }
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
                      className={`text-sm font-medium ${priorityColor(c.priority)}`}
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
                    {c.attachment_count > 0 ? `${c.attachment_count}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {total > 20 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-glass-border">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-gray-400 text-sm">
                Page {page} of {Math.ceil(total / 20)}
              </span>
              <button
                onClick={() =>
                  setPage((p) =>
                    p < Math.ceil(total / 20) ? p + 1 : p
                  )
                }
                disabled={page >= Math.ceil(total / 20)}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
