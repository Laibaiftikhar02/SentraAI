"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u.role !== "admin") {
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
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-gray-400 text-sm">Department complaint management</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{user?.name}</span>
          <button onClick={handleLogout} className="btn-secondary text-sm">
            Logout
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="glass-panel p-5">
          <p className="text-gray-400 text-sm">Total Complaints</p>
          <p className="text-3xl font-bold mt-1">0</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-gray-400 text-sm">High Priority</p>
          <p className="text-3xl font-bold mt-1 text-orange-400">0</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-gray-400 text-sm">Open</p>
          <p className="text-3xl font-bold mt-1 text-yellow-400">0</p>
        </div>
        <div className="glass-panel p-5">
          <p className="text-gray-400 text-sm">Resolved</p>
          <p className="text-3xl font-bold mt-1 text-green-400">0</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-panel p-6">
          <h2 className="text-lg font-semibold mb-3">Complaint Inbox</h2>
          <p className="text-gray-500 text-sm">No complaints in queue yet.</p>
        </div>
        <div className="glass-panel p-6">
          <h2 className="text-lg font-semibold mb-3">Campus Heatmap</h2>
          <p className="text-gray-500 text-sm">Heatmap will appear in Phase 5.</p>
        </div>
      </div>
    </div>
  );
}
