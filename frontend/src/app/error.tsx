"use client";

import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="glass-panel p-10 text-center max-w-md">
        <p className="text-7xl font-bold text-gray-600 mb-4">500</p>
        <h1 className="text-2xl font-bold mb-2">Something Went Wrong</h1>
        <p className="text-gray-400 mb-6">
          An unexpected error occurred. Please try again or return to the
          dashboard.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="btn-primary text-sm">
            Try Again
          </button>
          <Link href="/dashboard" className="btn-secondary text-sm">
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
