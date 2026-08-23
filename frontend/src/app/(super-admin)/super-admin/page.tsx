"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";

export default function SuperAdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u.role !== "super_admin") {
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
          <h1 className="text-2xl font-bold">Super Admin</h1>
          <p className="text-gray-400 text-sm">Organization configuration</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{user?.name}</span>
          <button onClick={handleLogout} className="btn-secondary text-sm">
            Logout
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Departments", desc: "Manage departments" },
          { title: "Categories", desc: "Manage complaint categories" },
          { title: "Admin Accounts", desc: "Create and manage admins" },
          { title: "Campus Zones", desc: "Configure heatmap zones" },
        ].map((card) => (
          <div key={card.title} className="glass-panel p-6 hover:bg-glass-light transition-colors cursor-pointer">
            <h3 className="text-lg font-semibold">{card.title}</h3>
            <p className="text-gray-500 text-sm mt-1">{card.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
