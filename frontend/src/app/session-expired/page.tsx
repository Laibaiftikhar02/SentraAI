"use client";

import Link from "next/link";
import { clearToken } from "@/lib/auth";

export default function SessionExpiredPage() {
  function handleLogout() {
    clearToken();
    window.location.href = "/login";
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="glass-panel p-10 text-center max-w-md">
        <p className="text-7xl font-bold text-gray-600 mb-4">401</p>
        <h1 className="text-2xl font-bold mb-2">Session Expired</h1>
        <p className="text-gray-400 mb-6">
          Your session has expired or you are not authenticated. Please log in
          again to continue.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={handleLogout} className="btn-primary text-sm">
            Go to Login
          </button>
          <Link href="/" className="btn-secondary text-sm">
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
