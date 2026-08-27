"use client";

import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="glass-panel p-10 text-center max-w-md">
        <p className="text-7xl font-bold text-gray-600 mb-4">403</p>
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-gray-400 mb-6">
          You do not have permission to access this resource. Please contact
          your administrator if you believe this is an error.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/dashboard" className="btn-primary text-sm">
            Go to Dashboard
          </Link>
          <Link href="/" className="btn-secondary text-sm">
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
