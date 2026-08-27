"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="glass-panel p-10 text-center max-w-md">
        <p className="text-7xl font-bold text-gray-600 mb-4">404</p>
        <h1 className="text-2xl font-bold mb-2">Page Not Found</h1>
        <p className="text-gray-400 mb-6">
          The page you are looking for does not exist or has been moved.
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
